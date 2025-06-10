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
    try {
        // Get the last check timestamp from Redis
        const lastCheck = await redis.get(DM_LAST_CHECK_KEY);
        const pythonScript = path.join(process.cwd(), 'src', 'services', 'bluesky_dm_poll.py');
        
        // Build command with optional since parameter
        const command = lastCheck 
            ? `python "${pythonScript}" "${lastCheck}"`
            : `python "${pythonScript}"`;
        
        logger.debug(`Polling for DMs with command: ${command}`);
        
        // Execute the Python script
        const result = execSync(command, { 
            encoding: 'utf8',
            env: { ...process.env },
            timeout: 30000 // 30 second timeout
        });
        
        // Parse the JSON response from Python
        const response = JSON.parse(result.trim());
        
        if (!response.success) {
            logger.error('DM polling failed:', response.error);
            return;
        }
        
        const { messages, new_message_count } = response;
        
        if (new_message_count === 0) {
            logger.debug('No new DMs found');
            return;
        }
        
        logger.info(`Found ${new_message_count} new DM(s)`);
        
        // Process each new message
        for (const dmMessage of messages) {
            await processDMMessage(dmMessage);
        }
        
        // Update the last check timestamp
        await redis.set(DM_LAST_CHECK_KEY, new Date().toISOString());
        
    } catch (error) {
        logger.error('Failed to poll for DMs:', error);
    }
};

const processDMMessage = async (dmMessage: BlueskyDMMessage) => {
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
        
        // Transform DM into Genesys Cloud message format
        const genesysMessage = {
            channel: {
                messageId: dmMessage.id, // Use DM message ID
                from: {
                    nickname: dmMessage.sender_handle,
                    id: dmMessage.sender_did,
                    idType: "Opaque",
                    firstName: dmMessage.sender_display_name || dmMessage.sender_handle
                },
                time: dmMessage.sent_at,
                // For DMs, use the message ID as rootId (since it's not a post thread)
                publicMetadata: {
                    rootId: dmMessage.id
                }
            },
            text: dmMessage.text
        };
        
        // Ingest the message into Genesys Cloud
        await ingestMessages([genesysMessage]);
        
        logger.info(`Successfully ingested DM from ${dmMessage.sender_handle}`);
        
    } catch (error) {
        logger.error(`Failed to process DM from ${dmMessage.sender_handle}:`, error);
    }
};

export const startDMPolling = () => {
    logger.info('Starting DM polling...');
    setInterval(processDMPolling, POLLING_INTERVAL_MS);
    processDMPolling(); // Run immediately on startup
}; 