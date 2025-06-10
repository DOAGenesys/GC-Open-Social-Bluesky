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
exports.webhookRouter = void 0;
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const bluesky_1 = require("../services/bluesky");
const genesys_1 = require("../services/genesys");
const redis_1 = require("../services/redis");
const logger_1 = require("../services/logger");
const router = (0, express_1.Router)();
const { GC_WEBHOOK_SECRET } = process.env;
if (!GC_WEBHOOK_SECRET) {
    throw new Error('Missing Genesys Cloud webhook secret in environment variables');
}
const verifySignature = (req) => {
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
        return false;
    }
    const expectedSignature = `sha256=${crypto_1.default
        .createHmac('sha256', GC_WEBHOOK_SECRET)
        .update(JSON.stringify(req.body))
        .digest('base64')}`;
    return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
};
router.post('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (!verifySignature(req)) {
        logger_1.logger.error('Webhook signature verification failed');
        res.status(401).send('Unauthorized');
        return;
    }
    logger_1.logger.info('Received valid webhook from Genesys Cloud:', req.body);
    const message = req.body;
    const { text, channel, id } = message;
    // Check for message deduplication (prevent processing same message multiple times)
    const dedupeKey = `webhook:processed:${id}`;
    logger_1.logger.debug(`Checking deduplication for message ID: ${id} with key: ${dedupeKey}`);
    try {
        const alreadyProcessed = yield redis_1.redis.get(dedupeKey);
        logger_1.logger.debug(`Deduplication check result for ${id}: ${alreadyProcessed ? 'DUPLICATE' : 'NEW'}`);
        if (alreadyProcessed) {
            logger_1.logger.warn(`SKIPPING DUPLICATE webhook message with ID: ${id} (previously processed at: ${alreadyProcessed})`);
            res.status(200).send();
            return;
        }
        // Mark this message as being processed (expires after 1 hour)
        const processingTimestamp = new Date().toISOString();
        yield redis_1.redis.set(dedupeKey, processingTimestamp, { ex: 3600 });
        logger_1.logger.info(`PROCESSING NEW webhook message ID: ${id} - marked in Redis at ${processingTimestamp}`);
    }
    catch (redisError) {
        logger_1.logger.error(`Redis deduplication failed for message ${id}:`, redisError);
        logger_1.logger.warn(`Proceeding with webhook processing despite Redis error to avoid blocking`);
    }
    // Check for reply information in the correct location
    const replyToId = ((_a = channel === null || channel === void 0 ? void 0 : channel.publicMetadata) === null || _a === void 0 ? void 0 : _a.replyToId) || (channel === null || channel === void 0 ? void 0 : channel.inReplyToMessageId);
    if (channel && channel.type === 'Private') {
        // Handle private messages (direct messages)
        try {
            const recipientDid = channel.to.id; // The Bluesky user's DID
            const dmResponse = yield (0, bluesky_1.sendDirectMessage)(text, recipientDid);
            yield (0, genesys_1.sendDeliveryReceipt)(id, channel, dmResponse.id || dmResponse.uri || '', true);
            logger_1.logger.info('Successfully processed private message.');
        }
        catch (error) {
            logger_1.logger.error('Failed to process private message:', error);
            yield (0, genesys_1.sendDeliveryReceipt)(id, channel, '', false, error.message);
        }
    }
    else if (channel && replyToId) {
        // Handle public replies
        try {
            const parentUri = replyToId;
            if (text.trim() === '!like') {
                const parentState = yield (0, redis_1.getConversationState)(parentUri);
                if (parentState) {
                    yield (0, bluesky_1.likePost)(parentUri, parentState.cid);
                    yield (0, genesys_1.sendDeliveryReceipt)(id, channel, '', true);
                }
                else {
                    throw new Error('Could not find parent post state to like.');
                }
            }
            else if (text.trim() === '!repost') {
                const parentState = yield (0, redis_1.getConversationState)(parentUri);
                if (parentState) {
                    yield (0, bluesky_1.repostPost)(parentUri, parentState.cid);
                    yield (0, genesys_1.sendDeliveryReceipt)(id, channel, '', true);
                }
                else {
                    throw new Error('Could not find parent post state to repost.');
                }
            }
            else {
                const replyResponse = yield (0, bluesky_1.postReply)(text, parentUri);
                yield (0, genesys_1.sendDeliveryReceipt)(id, channel, replyResponse.uri, true);
            }
            logger_1.logger.info('Successfully processed outbound message.');
        }
        catch (error) {
            logger_1.logger.error('Failed to process outbound command:', error);
            yield (0, genesys_1.sendDeliveryReceipt)(id, channel, '', false, error.message);
        }
    }
    else {
        logger_1.logger.warn('Ignoring message: not a private message and no reply information found.');
        logger_1.logger.debug('Channel type:', channel === null || channel === void 0 ? void 0 : channel.type);
        logger_1.logger.debug('Available channel fields:', Object.keys(channel || {}));
        logger_1.logger.debug('Channel publicMetadata:', channel === null || channel === void 0 ? void 0 : channel.publicMetadata);
    }
    res.status(200).send();
}));
exports.webhookRouter = router;
