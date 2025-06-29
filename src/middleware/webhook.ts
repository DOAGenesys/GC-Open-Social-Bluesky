import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { postReply, likePost, repostPost, sendDirectMessage } from '../services/bluesky';
import { sendDeliveryReceipt } from '../services/genesys';
import { getConversationState, redis } from '../services/redis';
import { logger } from '../services/logger';

const router = Router();

const { GC_WEBHOOK_SECRET } = process.env;

if (!GC_WEBHOOK_SECRET) {
    throw new Error('Missing Genesys Cloud webhook secret in environment variables');
}

const verifySignature = (req: Request) => {
    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) {
        return false;
    }

    const expectedSignature = `sha256=${crypto
        .createHmac('sha256', GC_WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('base64')}`;
    
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

router.post('/', async (req: Request, res: Response) : Promise<void> => {
    if (!verifySignature(req)) {
        logger.error('Webhook signature verification failed');
        res.status(401).send('Unauthorized');
        return;
    }

    logger.info('Received valid webhook from Genesys Cloud:', req.body);
    
    const message = req.body;
    const { text, channel, id } = message;

    // Check for message deduplication (prevent processing same message multiple times)
    const dedupeKey = `webhook:processed:${id}`;
    logger.debug(`Checking deduplication for message ID: ${id} with key: ${dedupeKey}`);
    
    try {
        const alreadyProcessed = await redis.get(dedupeKey);
        logger.debug(`Deduplication check result for ${id}: ${alreadyProcessed ? 'DUPLICATE' : 'NEW'}`);
        
        if (alreadyProcessed) {
            logger.warn(`SKIPPING DUPLICATE webhook message with ID: ${id} (previously processed at: ${alreadyProcessed})`);
            res.status(200).send();
            return;
        }
        
        // Mark this message as being processed (expires after 1 hour)
        const processingTimestamp = new Date().toISOString();
        await redis.set(dedupeKey, processingTimestamp, { ex: 3600 });
        logger.info(`PROCESSING NEW webhook message ID: ${id} - marked in Redis at ${processingTimestamp}`);
        
    } catch (redisError) {
        logger.error(`Redis deduplication failed for message ${id}:`, redisError);
        logger.warn(`Proceeding with webhook processing despite Redis error to avoid blocking`);
    }

    // Check for reply information in the correct location
    const replyToId = channel?.publicMetadata?.replyToId || channel?.inReplyToMessageId;
    
    if (channel && channel.type === 'Private') {
        // Handle private messages (direct messages)
        try {
            const recipientDid = channel.to.id; // The Bluesky user's DID
            const dmResponse = await sendDirectMessage(text, recipientDid);
            await sendDeliveryReceipt(id, channel, dmResponse.id || dmResponse.uri || '', true);
            logger.info('Successfully processed private message.');
        } catch (error: any) {
            logger.error('Failed to process private message:', error);
            await sendDeliveryReceipt(id, channel, '', false, error.message);
        }
    } else if (channel && replyToId) {
        // Handle public replies
        try {
            const parentUri = replyToId;
            if (text.trim() === '!like') {
                const parentState = await getConversationState(parentUri);
                if (parentState) {
                    await likePost(parentUri, parentState.cid);
                    await sendDeliveryReceipt(id, channel, '', true);
                } else {
                    throw new Error('Could not find parent post state to like.');
                }
            } else if (text.trim() === '!repost') {
                const parentState = await getConversationState(parentUri);
                if (parentState) {
                    await repostPost(parentUri, parentState.cid);
                    await sendDeliveryReceipt(id, channel, '', true);
                } else {
                    throw new Error('Could not find parent post state to repost.');
                }
            } else {
                const replyResponse = await postReply(text, parentUri);
                await sendDeliveryReceipt(id, channel, replyResponse.uri, true);
            }
            logger.info('Successfully processed outbound message.');
        } catch (error: any) {
            logger.error('Failed to process outbound command:', error);
            await sendDeliveryReceipt(id, channel, '', false, error.message);
        }
    } else {
        logger.warn('Ignoring message: not a private message and no reply information found.');
        logger.debug('Channel type:', channel?.type);
        logger.debug('Available channel fields:', Object.keys(channel || {}));
        logger.debug('Channel publicMetadata:', channel?.publicMetadata);
    }

    res.status(200).send();
});

export const webhookRouter = router; 