"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDMPolling = void 0;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const genesys_1 = require("../services/genesys");
const redis_1 = require("../services/redis");
const logger_1 = require("../services/logger");
const { POLLING_TIME_DM } = process.env;
const POLLING_INTERVAL_MS = POLLING_TIME_DM ? parseInt(POLLING_TIME_DM, 10) * 1000 : 120000; // 2 minutes default
const DM_LAST_CHECK_KEY = 'bluesky:dm:last_check';
const processDMPolling = () => __awaiter(void 0, void 0, void 0, function* () {
    logger_1.logger.debug('Starting DM polling cycle...');
    try {
        // Get the last check timestamp from Redis
        const lastCheck = yield redis_1.redis.get(DM_LAST_CHECK_KEY);
        const pythonScript = path.join(process.cwd(), 'src', 'services', 'bluesky_dm_poll.py');
        logger_1.logger.debug(`Last DM check timestamp: ${lastCheck || 'none (first time)'}`);
        // Build command with optional since parameter
        const command = lastCheck
            ? `python "${pythonScript}" "${lastCheck}"`
            : `python "${pythonScript}"`;
        logger_1.logger.debug(`Executing DM polling command: ${command}`);
        // Execute the Python script
        const result = (0, child_process_1.execSync)(command, {
            encoding: 'utf8',
            env: Object.assign({}, process.env),
            timeout: 30000 // 30 second timeout
        });
        logger_1.logger.debug(`Python script output: ${result}`);
        // Parse the JSON response from Python
        const response = JSON.parse(result.trim());
        if (!response.success) {
            logger_1.logger.error('DM polling failed:', response.error);
            return;
        }
        const { messages, new_message_count, total_conversations, bot_did } = response;
        logger_1.logger.debug(`DM polling results: ${new_message_count} new messages from ${total_conversations} total conversations`);
        if (new_message_count === 0) {
            logger_1.logger.debug('No new DMs found');
            return;
        }
        logger_1.logger.info(`Found ${new_message_count} new DM(s) to process`);
        // Process each new message with bot DID
        for (const dmMessage of messages) {
            yield processDMMessage(dmMessage, bot_did);
        }
        // Update the last check timestamp
        const newTimestamp = new Date().toISOString();
        yield redis_1.redis.set(DM_LAST_CHECK_KEY, newTimestamp);
        logger_1.logger.debug(`Updated last DM check timestamp to: ${newTimestamp}`);
    }
    catch (error) {
        logger_1.logger.error('Failed to poll for DMs:', error);
        if (error instanceof Error && error.message) {
            logger_1.logger.error('Error details:', error.message);
        }
    }
});
const processDMMessage = (dmMessage, botDid) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        logger_1.logger.info(`Processing DM from ${dmMessage.sender_handle}: "${dmMessage.text}"`);
        // Create or update external contact for the sender
        const { ENABLE_EXTERNAL_CONTACTS } = process.env;
        if (ENABLE_EXTERNAL_CONTACTS === 'true') {
            yield (0, genesys_1.createOrUpdateExternalContact)(dmMessage.sender_did, dmMessage.sender_handle, dmMessage.sender_display_name);
        }
        // Transform DM into Genesys Cloud message format for PRIVATE messages
        const genesysMessage = {
            channel: {
                messageId: dmMessage.id, // Use DM message ID
                platform: "Open", // Required platform field
                type: "Private", // Critical: Mark as Private message for DMs
                from: {
                    nickname: dmMessage.sender_handle || dmMessage.sender_did,
                    id: dmMessage.sender_did,
                    idType: "Opaque",
                    firstName: dmMessage.sender_display_name || dmMessage.sender_handle
                },
                to: {
                    id: botDid, // Use the bot's actual DID from Python response
                    idType: "Opaque"
                },
                time: dmMessage.sent_at,
                // For DMs, use conversation ID and message ID for tracking
                publicMetadata: {
                    rootId: dmMessage.convo_id,
                    replyToId: dmMessage.id
                }
            },
            text: dmMessage.text
        };
        // Debug: Log the complete message structure before ingestion
        logger_1.logger.debug('Genesys Cloud DM message structure:', JSON.stringify(genesysMessage, null, 2));
        // Ingest the message into Genesys Cloud
        yield (0, genesys_1.ingestMessages)([genesysMessage]);
        logger_1.logger.info(`Successfully ingested DM from ${dmMessage.sender_handle}`);
    }
    catch (error) {
        logger_1.logger.error(`Failed to process DM from ${dmMessage.sender_handle}:`, error);
    }
});
const startDMPolling = () => {
    logger_1.logger.info(`Starting DM polling with ${POLLING_INTERVAL_MS / 1000}s interval...`);
    // Set up the polling interval
    const intervalId = setInterval(processDMPolling, POLLING_INTERVAL_MS);
    // Run immediately on startup
    logger_1.logger.info('Running initial DM polling check...');
    processDMPolling()
        .then(() => {
        logger_1.logger.info('Initial DM polling completed successfully');
    })
        .catch((error) => {
        logger_1.logger.error('Initial DM polling failed:', error);
    });
    return intervalId;
};
exports.startDMPolling = startDMPolling;
