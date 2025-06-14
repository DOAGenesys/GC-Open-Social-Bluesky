import axios from 'axios';
import dotenv from 'dotenv';
import { GenesysCloudMessage } from '../mappers/message';
import { logger } from './logger';

dotenv.config();

const { GC_REGION, GC_CC_CLIENT_ID, GC_CC_CLIENT_SECRET } = process.env;

if (!GC_REGION || !GC_CC_CLIENT_ID || !GC_CC_CLIENT_SECRET) {
  throw new Error('Missing Genesys Cloud credentials in environment variables');
}

let accessToken: string | null = null;
let tokenExpiry: number | null = null;

const getAccessToken = async (): Promise<string> => {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  try {
    const auth = Buffer.from(`${GC_CC_CLIENT_ID}:${GC_CC_CLIENT_SECRET}`).toString('base64');
    const response = await axios.post(
      `https://login.${GC_REGION}/oauth/token`,
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
        },
      },
    );

    accessToken = response.data.access_token;
    if (!accessToken) {
        throw new Error('Access token was null in response');
    }
    // Set expiry to 60 seconds before the actual expiry time to be safe
    tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
    logger.info('Successfully retrieved Genesys Cloud access token');
    return accessToken;
  } catch (error) {
    if (axios.isAxiosError(error)) {
        logger.error('Failed to get Genesys Cloud access token:', error.response?.data || error.message);
    } else {
        logger.error('Failed to get Genesys Cloud access token:', error);
    }
    throw new Error('Failed to get Genesys Cloud access token');
  }
};

export const getGenesysCloudApiClient = () => {
  const apiClient = axios.create({
    baseURL: `https://api.${GC_REGION}`,
  });

  apiClient.interceptors.request.use(async (config) => {
    config.headers.Authorization = `Bearer ${await getAccessToken()}`;
    return config;
  });

  return apiClient;
};

export const ingestMessages = async (messages: GenesysCloudMessage[]): Promise<any> => {
    const apiClient = getGenesysCloudApiClient();
    const { GC_SOCIAL_TOPIC_ID, GC_SOCIAL_RULE_ID } = process.env;

    if (!GC_SOCIAL_TOPIC_ID || !GC_SOCIAL_RULE_ID) {
        throw new Error('Missing Genesys Cloud Social Topic or Rule ID in environment variables');
    }

    try {
        logger.debug(`Ingesting ${messages.length} message(s) to Genesys Cloud...`);
        logger.debug(`Using Topic ID: ${GC_SOCIAL_TOPIC_ID}, Rule ID: ${GC_SOCIAL_RULE_ID}`);
        
        const response = await apiClient.post(
            `/api/v2/socialmedia/topics/${GC_SOCIAL_TOPIC_ID}/dataingestionrules/open/${GC_SOCIAL_RULE_ID}/messages/bulk`,
            messages,
        );
        logger.info('Successfully ingested messages into Genesys Cloud');
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            logger.error('Failed to ingest messages into Genesys Cloud:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                url: error.config?.url,
                method: error.config?.method
            });
            logger.error('Request payload that failed:', JSON.stringify(messages, null, 2));
        } else {
            logger.error('Failed to ingest messages into Genesys Cloud:', error);
        }
        throw new Error('Failed to ingest messages into Genesys Cloud');
    }
}

export const ingestDirectMessage = async (dmMessage: any): Promise<any> => {
    const apiClient = getGenesysCloudApiClient();
    const { GC_INTEGRATION_ID } = process.env;

    if (!GC_INTEGRATION_ID) {
        throw new Error('Missing Genesys Cloud Integration ID in environment variables');
    }

    try {
        logger.debug('Ingesting DM to Genesys Cloud using Open Messaging inbound endpoint...');
        logger.debug(`Using Integration ID: ${GC_INTEGRATION_ID}`);
        
        const response = await apiClient.post(
            `/api/v2/conversations/messages/${GC_INTEGRATION_ID}/inbound/open/message`,
            dmMessage,
        );
        logger.info('Successfully ingested DM into Genesys Cloud');
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            logger.error('Failed to ingest DM into Genesys Cloud:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                url: error.config?.url,
                method: error.config?.method
            });
            logger.error('DM payload that failed:', JSON.stringify(dmMessage, null, 2));
        } else {
            logger.error('Failed to ingest DM into Genesys Cloud:', error);
        }
        throw new Error('Failed to ingest DM into Genesys Cloud');
    }
};

export const sendDeliveryReceipt = async (messageId: string, originalChannel: any, blueskyPostUri: string, success: boolean, errorMessage?: string): Promise<any> => {
    const apiClient = getGenesysCloudApiClient();
    const { GC_INTEGRATION_ID } = process.env;

    if (!GC_INTEGRATION_ID) {
        throw new Error('Missing Genesys Cloud Integration ID in environment variables');
    }

    const receipt = {
        id: messageId,
        channel: {
            id: originalChannel.id,
            platform: originalChannel.platform,
            type: originalChannel.type,
            to: originalChannel.to,  // Required field that was missing
            from: originalChannel.from,
            messageId: blueskyPostUri,
            time: new Date().toISOString(),  // Add required date field
        },
        status: success ? 'Delivered' : 'Failed',
        isFinalReceipt: true,
        reasons: errorMessage ? [{ code: 'GeneralError', message: errorMessage }] : undefined,
    };

    try {
        const response = await apiClient.post(
            `/api/v2/conversations/messages/${GC_INTEGRATION_ID}/inbound/open/receipt`,
            receipt,
        );
        logger.info('Successfully sent delivery receipt to Genesys Cloud');
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            logger.error('Failed to send delivery receipt to Genesys Cloud:', error.response?.data || error.message);
        } else {
            logger.error('Failed to send delivery receipt to Genesys Cloud:', error);
        }
        throw new Error('Failed to send delivery receipt to Genesys Cloud');
    }
}

export const createOrUpdateExternalContact = async (did: string, displayName: string, handle: string): Promise<any> => {
    const apiClient = getGenesysCloudApiClient();
    const { GC_EXTERNAL_SOURCE_ID, GC_EC_DIVISION_ID } = process.env;

    if (!GC_EXTERNAL_SOURCE_ID) {
        throw new Error('Missing GC_EXTERNAL_SOURCE_ID environment variable. This should be the ID of the "Bluesky" external source in Genesys Cloud.');
    }

    if (!GC_EC_DIVISION_ID) {
        throw new Error('Missing GC_EC_DIVISION_ID environment variable. This should be the ID of the division for external contacts in Genesys Cloud.');
    }

    // Only include fields that have actual values (not empty strings)
    const contact: any = {
        firstName: displayName,
        division: {
            id: GC_EC_DIVISION_ID  // Division should be an object with id property
        },
        externalIds: [
            {
                externalSource: {
                    id: GC_EXTERNAL_SOURCE_ID  // ExternalSource should be an object with id property
                },
                value: did,
            }
        ]
    };

    // Note: We don't include lastName since Bluesky users typically only have 
    // a display name or handle. Including empty fields causes API errors.

    logger.debug(`Creating/updating contact for DID: ${did}, displayName: ${displayName}, handle: ${handle}`);
    logger.debug(`Contact payload:`, contact);

    try {
        // First, try to find an existing contact by the DID
        // URL encode the DID to handle special characters
        const encodedDid = encodeURIComponent(did);
        const searchUrl = `/api/v2/externalcontacts/contacts?q=${encodedDid}`;
        logger.debug(`Searching for existing contact with URL: ${searchUrl}`);
        
        const searchResponse = await apiClient.get(searchUrl);
        logger.debug(`Search response:`, { 
            status: searchResponse.status, 
            entitiesCount: searchResponse.data.entities?.length || 0,
            entities: searchResponse.data.entities 
        });

        if (searchResponse.data.entities && searchResponse.data.entities.length > 0) {
            // Contact exists, update it
            const existingContact = searchResponse.data.entities[0];
            logger.debug(`Updating existing contact with ID: ${existingContact.id}`);
            const updateResponse = await apiClient.put(`/api/v2/externalcontacts/contacts/${existingContact.id}`, contact);
            logger.info('Successfully updated external contact in Genesys Cloud');
            return updateResponse.data;
        } else {
            // Contact does not exist, create it
            logger.debug(`Creating new contact with payload:`, contact);
            const createResponse = await apiClient.post('/api/v2/externalcontacts/contacts', contact);
            logger.info('Successfully created external contact in Genesys Cloud');
            return createResponse.data;
        }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            const errorData = error.response?.data;
            
            // Check for specific error indicating missing or invalid external source
            if (error.response?.status === 400 && 
                (errorData?.message?.includes('malformed') || errorData?.code === 'bad.request')) {
                logger.error('Failed to create external contact - this is likely because:');
                logger.error('1. The "Bluesky" external source does not exist in Genesys Cloud, OR');
                logger.error('2. The GC_EXTERNAL_SOURCE_ID environment variable has an incorrect ID');
                logger.error('To fix: Verify the external source exists and get its correct ID from Admin > External Contacts > Sources');
                logger.error('See README.md Step 2.4 for detailed instructions.');
            }
            
            logger.error('Failed to create or update external contact in Genesys Cloud:', {
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                headers: error.response?.headers,
                url: error.config?.url,
                method: error.config?.method,
                requestData: error.config?.data
            });
            logger.debug('Full error details:', error);
        } else {
            logger.error('Failed to create or update external contact in Genesys Cloud:', error);
        }
        throw new Error('Failed to create or update external contact in Genesys Cloud');
    }
}
