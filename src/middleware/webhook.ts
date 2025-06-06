import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { postReply, likePost, repostPost } from '../services/bluesky';
import { sendDeliveryReceipt } from '../services/genesys';
import { getConversationState } from '../services/redis';
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

    if (channel && channel.inReplyToMessageId) {
        try {
            const parentUri = channel.inReplyToMessageId;
            if (text.trim() === '!like') {
                const parentState = await getConversationState(parentUri);
                if (parentState) {
                    await likePost(parentUri, parentState.cid);
                    await sendDeliveryReceipt(id, '', true);
                } else {
                    throw new Error('Could not find parent post state to like.');
                }
            } else if (text.trim() === '!repost') {
                const parentState = await getConversationState(parentUri);
                if (parentState) {
                    await repostPost(parentUri, parentState.cid);
                    await sendDeliveryReceipt(id, '', true);
                } else {
                    throw new Error('Could not find parent post state to repost.');
                }
            } else {
                const replyResponse = await postReply(text, parentUri);
                await sendDeliveryReceipt(id, replyResponse.uri, true);
            }
            logger.info('Successfully processed outbound message.');
        } catch (error: any) {
            logger.error('Failed to process outbound command:', error);
            await sendDeliveryReceipt(id, '', false, error.message);
        }
    } else {
        logger.warn('Ignoring message without inReplyToMessageId for now.');
    }

    res.status(200).send();
});

export const webhookRouter = router; 