import { execSync } from 'child_process';
import * as path from 'path';
import { ingestMessages, createOrUpdateExternalContact } from '../services/genesys';
import { redis } from '../services/redis';
import { logger } from '../services/logger';

const { POLLING_TIME_DM } = process.env;
const POLLING_INTERVAL_MS = POLLING_TIME_DM ? parseInt(POLLING_TIME_DM, 10) * 1000 : 120000; // 2 minutes default

const DM_LAST_CHECK_KEY = 'bluesky:dm:last_check';

interface BlueskyDMMessage {
    id: string;
    convo_id: string;
    sender_did: string;
    sender_handle: string;
    sender_display_name: string;
    text: string;
    sent_at: string;
    conversation_members: string[];
}

const processDMPolling = async () => {
    logger.debug('Starting DM polling cycle...');
    
    try {
        // Get the last check timestamp from Redis
        const lastCheck = await redis.get(DM_LAST_CHECK_KEY);
        const pythonScript = path.join(process.cwd(), 'src', 'services', 'bluesky_dm_poll.py');
        
        logger.debug(`Last DM check timestamp: ${lastCheck || 'none (first time)'}`);
        
        // Build command with optional since parameter
        const command = lastCheck 
            ? `python "${pythonScript}" "${lastCheck}"`
            : `python "${pythonScript}"`;
        
        logger.debug(`Executing DM polling command: ${command}`);
        
        // Execute the Python script
        const result = execSync(command, { 
            encoding: 'utf8',
            env: { ...process.env },
            timeout: 30000 // 30 second timeout
        });
        
        logger.debug(`Python script output: ${result}`);
        
        // Parse the JSON response from Python
        const response = JSON.parse(result.trim());
        
        if (!response.success) {
            logger.error('DM polling failed:', response.error);
            return;
        }
        
        const { messages, new_message_count, total_conversations, bot_did } = response;
        
        logger.debug(`DM polling results: ${new_message_count} new messages from ${total_conversations} total conversations`);
        
        if (new_message_count === 0) {
            logger.debug('No new DMs found');
            return;
        }
        
        logger.info(`Found ${new_message_count} new DM(s) to process`);
        
        // Process each new message with bot DID
        for (const dmMessage of messages) {
            await processDMMessage(dmMessage, bot_did);
        }
        
        // Update the last check timestamp
        const newTimestamp = new Date().toISOString();
        await redis.set(DM_LAST_CHECK_KEY, newTimestamp);
        logger.debug(`Updated last DM check timestamp to: ${newTimestamp}`);
        
    } catch (error) {
        logger.error('Failed to poll for DMs:', error);
        if (error instanceof Error && error.message) {
            logger.error('Error details:', error.message);
        }
    }
};

const processDMMessage = async (dmMessage: BlueskyDMMessage, botDid: string) => {
    try {
        logger.info(`Processing DM from ${dmMessage.sender_handle}: "${dmMessage.text}"`);
        
        // Create or update external contact for the sender
        const { ENABLE_EXTERNAL_CONTACTS } = process.env;
        if (ENABLE_EXTERNAL_CONTACTS === 'true') {
            await createOrUpdateExternalContact(
                dmMessage.sender_did,
                dmMessage.sender_handle,
                dmMessage.sender_display_name
            );
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
        logger.debug('Genesys Cloud DM message structure:', JSON.stringify(genesysMessage, null, 2));
        
        // Ingest the message into Genesys Cloud
        await ingestMessages([genesysMessage]);
        
        logger.info(`Successfully ingested DM from ${dmMessage.sender_handle}`);
        
    } catch (error) {
        logger.error(`Failed to process DM from ${dmMessage.sender_handle}:`, error);
    }
};

export const startDMPolling = () => {
    logger.info(`Starting DM polling with ${POLLING_INTERVAL_MS / 1000}s interval...`);
    
    // Set up the polling interval
    const intervalId = setInterval(processDMPolling, POLLING_INTERVAL_MS);
    
    // Run immediately on startup
    logger.info('Running initial DM polling check...');
    processDMPolling()
        .then(() => {
            logger.info('Initial DM polling completed successfully');
        })
        .catch((error) => {
            logger.error('Initial DM polling failed:', error);
        });
    
    return intervalId;
}; 