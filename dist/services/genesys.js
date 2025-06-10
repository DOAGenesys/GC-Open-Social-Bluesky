"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrUpdateExternalContact = exports.sendDeliveryReceipt = exports.ingestDirectMessage = exports.ingestMessages = exports.getGenesysCloudApiClient = void 0;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("./logger");
dotenv_1.default.config();
const { GC_REGION, GC_CC_CLIENT_ID, GC_CC_CLIENT_SECRET } = process.env;
if (!GC_REGION || !GC_CC_CLIENT_ID || !GC_CC_CLIENT_SECRET) {
    throw new Error('Missing Genesys Cloud credentials in environment variables');
}
let accessToken = null;
let tokenExpiry = null;
const getAccessToken = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
        return accessToken;
    }
    try {
        const auth = Buffer.from(`${GC_CC_CLIENT_ID}:${GC_CC_CLIENT_SECRET}`).toString('base64');
        const response = yield axios_1.default.post(`https://login.${GC_REGION}/oauth/token`, 'grant_type=client_credentials', {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${auth}`,
            },
        });
        accessToken = response.data.access_token;
        if (!accessToken) {
            throw new Error('Access token was null in response');
        }
        // Set expiry to 60 seconds before the actual expiry time to be safe
        tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
        logger_1.logger.info('Successfully retrieved Genesys Cloud access token');
        return accessToken;
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            logger_1.logger.error('Failed to get Genesys Cloud access token:', ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
        }
        else {
            logger_1.logger.error('Failed to get Genesys Cloud access token:', error);
        }
        throw new Error('Failed to get Genesys Cloud access token');
    }
});
const getGenesysCloudApiClient = () => {
    const apiClient = axios_1.default.create({
        baseURL: `https://api.${GC_REGION}`,
    });
    apiClient.interceptors.request.use((config) => __awaiter(void 0, void 0, void 0, function* () {
        config.headers.Authorization = `Bearer ${yield getAccessToken()}`;
        return config;
    }));
    return apiClient;
};
exports.getGenesysCloudApiClient = getGenesysCloudApiClient;
const ingestMessages = (messages) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    const apiClient = (0, exports.getGenesysCloudApiClient)();
    const { GC_SOCIAL_TOPIC_ID, GC_SOCIAL_RULE_ID } = process.env;
    if (!GC_SOCIAL_TOPIC_ID || !GC_SOCIAL_RULE_ID) {
        throw new Error('Missing Genesys Cloud Social Topic or Rule ID in environment variables');
    }
    try {
        logger_1.logger.debug(`Ingesting ${messages.length} message(s) to Genesys Cloud...`);
        logger_1.logger.debug(`Using Topic ID: ${GC_SOCIAL_TOPIC_ID}, Rule ID: ${GC_SOCIAL_RULE_ID}`);
        const response = yield apiClient.post(`/api/v2/socialmedia/topics/${GC_SOCIAL_TOPIC_ID}/dataingestionrules/open/${GC_SOCIAL_RULE_ID}/messages/bulk`, messages);
        logger_1.logger.info('Successfully ingested messages into Genesys Cloud');
        return response.data;
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            logger_1.logger.error('Failed to ingest messages into Genesys Cloud:', {
                status: (_a = error.response) === null || _a === void 0 ? void 0 : _a.status,
                statusText: (_b = error.response) === null || _b === void 0 ? void 0 : _b.statusText,
                data: (_c = error.response) === null || _c === void 0 ? void 0 : _c.data,
                url: (_d = error.config) === null || _d === void 0 ? void 0 : _d.url,
                method: (_e = error.config) === null || _e === void 0 ? void 0 : _e.method
            });
            logger_1.logger.error('Request payload that failed:', JSON.stringify(messages, null, 2));
        }
        else {
            logger_1.logger.error('Failed to ingest messages into Genesys Cloud:', error);
        }
        throw new Error('Failed to ingest messages into Genesys Cloud');
    }
});
exports.ingestMessages = ingestMessages;
const ingestDirectMessage = (dmMessage) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e;
    const apiClient = (0, exports.getGenesysCloudApiClient)();
    const { GC_INTEGRATION_ID } = process.env;
    if (!GC_INTEGRATION_ID) {
        throw new Error('Missing Genesys Cloud Integration ID in environment variables');
    }
    try {
        logger_1.logger.debug('Ingesting DM to Genesys Cloud using Open Messaging inbound endpoint...');
        logger_1.logger.debug(`Using Integration ID: ${GC_INTEGRATION_ID}`);
        const response = yield apiClient.post(`/api/v2/conversations/messages/${GC_INTEGRATION_ID}/inbound/open/message`, dmMessage);
        logger_1.logger.info('Successfully ingested DM into Genesys Cloud');
        return response.data;
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            logger_1.logger.error('Failed to ingest DM into Genesys Cloud:', {
                status: (_a = error.response) === null || _a === void 0 ? void 0 : _a.status,
                statusText: (_b = error.response) === null || _b === void 0 ? void 0 : _b.statusText,
                data: (_c = error.response) === null || _c === void 0 ? void 0 : _c.data,
                url: (_d = error.config) === null || _d === void 0 ? void 0 : _d.url,
                method: (_e = error.config) === null || _e === void 0 ? void 0 : _e.method
            });
            logger_1.logger.error('DM payload that failed:', JSON.stringify(dmMessage, null, 2));
        }
        else {
            logger_1.logger.error('Failed to ingest DM into Genesys Cloud:', error);
        }
        throw new Error('Failed to ingest DM into Genesys Cloud');
    }
});
exports.ingestDirectMessage = ingestDirectMessage;
const sendDeliveryReceipt = (messageId, originalChannel, blueskyPostUri, success, errorMessage) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const apiClient = (0, exports.getGenesysCloudApiClient)();
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
            to: originalChannel.to, // Required field that was missing
            from: originalChannel.from,
            messageId: blueskyPostUri,
            time: new Date().toISOString(), // Add required date field
        },
        status: success ? 'Delivered' : 'Failed',
        isFinalReceipt: true,
        reasons: errorMessage ? [{ code: 'GeneralError', message: errorMessage }] : undefined,
    };
    try {
        const response = yield apiClient.post(`/api/v2/conversations/messages/${GC_INTEGRATION_ID}/inbound/open/receipt`, receipt);
        logger_1.logger.info('Successfully sent delivery receipt to Genesys Cloud');
        return response.data;
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            logger_1.logger.error('Failed to send delivery receipt to Genesys Cloud:', ((_a = error.response) === null || _a === void 0 ? void 0 : _a.data) || error.message);
        }
        else {
            logger_1.logger.error('Failed to send delivery receipt to Genesys Cloud:', error);
        }
        throw new Error('Failed to send delivery receipt to Genesys Cloud');
    }
});
exports.sendDeliveryReceipt = sendDeliveryReceipt;
const createOrUpdateExternalContact = (did, displayName, handle) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const apiClient = (0, exports.getGenesysCloudApiClient)();
    const { GC_EXTERNAL_SOURCE_ID, GC_EC_DIVISION_ID } = process.env;
    if (!GC_EXTERNAL_SOURCE_ID) {
        throw new Error('Missing GC_EXTERNAL_SOURCE_ID environment variable. This should be the ID of the "Bluesky" external source in Genesys Cloud.');
    }
    if (!GC_EC_DIVISION_ID) {
        throw new Error('Missing GC_EC_DIVISION_ID environment variable. This should be the ID of the division for external contacts in Genesys Cloud.');
    }
    // Only include fields that have actual values (not empty strings)
    const contact = {
        firstName: displayName,
        division: {
            id: GC_EC_DIVISION_ID // Division should be an object with id property
        },
        externalIds: [
            {
                externalSource: {
                    id: GC_EXTERNAL_SOURCE_ID // ExternalSource should be an object with id property
                },
                value: did,
            }
        ]
    };
    // Note: We don't include lastName since Bluesky users typically only have 
    // a display name or handle. Including empty fields causes API errors.
    logger_1.logger.debug(`Creating/updating contact for DID: ${did}, displayName: ${displayName}, handle: ${handle}`);
    logger_1.logger.debug(`Contact payload:`, contact);
    try {
        // First, try to find an existing contact by the DID
        // URL encode the DID to handle special characters
        const encodedDid = encodeURIComponent(did);
        const searchUrl = `/api/v2/externalcontacts/contacts?q=${encodedDid}`;
        logger_1.logger.debug(`Searching for existing contact with URL: ${searchUrl}`);
        const searchResponse = yield apiClient.get(searchUrl);
        logger_1.logger.debug(`Search response:`, {
            status: searchResponse.status,
            entitiesCount: ((_a = searchResponse.data.entities) === null || _a === void 0 ? void 0 : _a.length) || 0,
            entities: searchResponse.data.entities
        });
        if (searchResponse.data.entities && searchResponse.data.entities.length > 0) {
            // Contact exists, update it
            const existingContact = searchResponse.data.entities[0];
            logger_1.logger.debug(`Updating existing contact with ID: ${existingContact.id}`);
            const updateResponse = yield apiClient.put(`/api/v2/externalcontacts/contacts/${existingContact.id}`, contact);
            logger_1.logger.info('Successfully updated external contact in Genesys Cloud');
            return updateResponse.data;
        }
        else {
            // Contact does not exist, create it
            logger_1.logger.debug(`Creating new contact with payload:`, contact);
            const createResponse = yield apiClient.post('/api/v2/externalcontacts/contacts', contact);
            logger_1.logger.info('Successfully created external contact in Genesys Cloud');
            return createResponse.data;
        }
    }
    catch (error) {
        if (axios_1.default.isAxiosError(error)) {
            const errorData = (_b = error.response) === null || _b === void 0 ? void 0 : _b.data;
            // Check for specific error indicating missing or invalid external source
            if (((_c = error.response) === null || _c === void 0 ? void 0 : _c.status) === 400 &&
                (((_d = errorData === null || errorData === void 0 ? void 0 : errorData.message) === null || _d === void 0 ? void 0 : _d.includes('malformed')) || (errorData === null || errorData === void 0 ? void 0 : errorData.code) === 'bad.request')) {
                logger_1.logger.error('Failed to create external contact - this is likely because:');
                logger_1.logger.error('1. The "Bluesky" external source does not exist in Genesys Cloud, OR');
                logger_1.logger.error('2. The GC_EXTERNAL_SOURCE_ID environment variable has an incorrect ID');
                logger_1.logger.error('To fix: Verify the external source exists and get its correct ID from Admin > External Contacts > Sources');
                logger_1.logger.error('See README.md Step 2.4 for detailed instructions.');
            }
            logger_1.logger.error('Failed to create or update external contact in Genesys Cloud:', {
                status: (_e = error.response) === null || _e === void 0 ? void 0 : _e.status,
                statusText: (_f = error.response) === null || _f === void 0 ? void 0 : _f.statusText,
                data: (_g = error.response) === null || _g === void 0 ? void 0 : _g.data,
                headers: (_h = error.response) === null || _h === void 0 ? void 0 : _h.headers,
                url: (_j = error.config) === null || _j === void 0 ? void 0 : _j.url,
                method: (_k = error.config) === null || _k === void 0 ? void 0 : _k.method,
                requestData: (_l = error.config) === null || _l === void 0 ? void 0 : _l.data
            });
            logger_1.logger.debug('Full error details:', error);
        }
        else {
            logger_1.logger.error('Failed to create or update external contact in Genesys Cloud:', error);
        }
        throw new Error('Failed to create or update external contact in Genesys Cloud');
    }
});
exports.createOrUpdateExternalContact = createOrUpdateExternalContact;
