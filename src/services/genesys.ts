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
        const response = await apiClient.post(
            `/api/v2/socialmedia/topics/${GC_SOCIAL_TOPIC_ID}/dataingestionrules/open/${GC_SOCIAL_RULE_ID}/messages/bulk`,
            messages,
        );
        logger.info('Successfully ingested messages into Genesys Cloud');
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            logger.error('Failed to ingest messages into Genesys Cloud:', error.response?.data || error.message);
        } else {
            logger.error('Failed to ingest messages into Genesys Cloud:', error);
        }
        throw new Error('Failed to ingest messages into Genesys Cloud');
    }
}

export const sendDeliveryReceipt = async (messageId: string, blueskyPostUri: string, success: boolean, errorMessage?: string): Promise<any> => {
    const apiClient = getGenesysCloudApiClient();
    const { GC_INTEGRATION_ID } = process.env;

    if (!GC_INTEGRATION_ID) {
        throw new Error('Missing Genesys Cloud Integration ID in environment variables');
    }

    const receipt = {
        id: messageId,
        channel: {
            messageId: blueskyPostUri,
        },
        status: success ? 'Delivered' : 'Failed',
        isFinalReceipt: true,
        reasons: errorMessage ? [{ code: 'Error', message: errorMessage }] : undefined,
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

    const contact = {
        firstName: displayName,
        lastName: '',
        externalIds: [
            {
                externalSource: 'Bluesky',
                value: did,
            }
        ],
        // It would be good to store the handle somewhere, but there is no standard field for it.
        // We could use a custom field if the customer sets it up.
        // For now, we will just use the display name.
    };

    try {
        // First, try to find an existing contact by the DID
        const searchResponse = await apiClient.get(`/api/v2/externalcontacts/contacts?q=${did}`);
        if (searchResponse.data.entities.length > 0) {
            // Contact exists, update it
            const existingContact = searchResponse.data.entities[0];
            const updateResponse = await apiClient.put(`/api/v2/externalcontacts/contacts/${existingContact.id}`, contact);
            logger.info('Successfully updated external contact in Genesys Cloud');
            return updateResponse.data;
        } else {
            // Contact does not exist, create it
            const createResponse = await apiClient.post('/api/v2/externalcontacts/contacts', contact);
            logger.info('Successfully created external contact in Genesys Cloud');
            return createResponse.data;
        }
    } catch (error) {
        if (axios.isAxiosError(error)) {
            logger.error('Failed to create or update external contact in Genesys Cloud:', error.response?.data || error.message);
        } else {
            logger.error('Failed to create or update external contact in Genesys Cloud:', error);
        }
        throw new Error('Failed to create or update external contact in Genesys Cloud');
    }
}
