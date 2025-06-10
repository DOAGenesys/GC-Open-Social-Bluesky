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
Object.defineProperty(exports, "__esModule", { value: true });
exports.startInboundPolling = void 0;
const bluesky_1 = require("../services/bluesky");
const redis_1 = require("../services/redis");
const message_1 = require("../mappers/message");
const genesys_1 = require("../services/genesys");
const logger_1 = require("../services/logger");
const { POLLING_TIME_INBOUND_NOTIFICATIONS } = process.env;
const POLLING_INTERVAL_MS = POLLING_TIME_INBOUND_NOTIFICATIONS ? parseInt(POLLING_TIME_INBOUND_NOTIFICATIONS, 10) * 1000 : 60000; // 1 minute default
let lastSeenNotif = undefined;
const processNotifications = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const agent = yield (0, bluesky_1.getBlueskyAgent)();
        const notifications = yield agent.listNotifications({ cursor: lastSeenNotif });
        if (notifications.data.notifications.length > 0) {
            logger_1.logger.info(`Fetched ${notifications.data.notifications.length} new notifications.`);
            lastSeenNotif = notifications.data.cursor;
            const newMentions = [];
            for (const notif of notifications.data.notifications) {
                if (notif.reason === 'mention' || notif.reason === 'reply') {
                    const state = yield (0, redis_1.getConversationState)(notif.uri);
                    if (state) {
                        logger_1.logger.debug(`Skipping already processed post: ${notif.uri}`);
                        continue;
                    }
                    newMentions.push(notif);
                }
            }
            if (newMentions.length > 0) {
                const postsResponse = yield agent.getPosts({ uris: newMentions.map(n => n.uri) });
                if (postsResponse.data.posts) {
                    // Create/update contacts first (only if enabled)
                    const { ENABLE_EXTERNAL_CONTACTS } = process.env;
                    if (ENABLE_EXTERNAL_CONTACTS === 'true') {
                        logger_1.logger.debug('External contacts feature is enabled, creating/updating contacts...');
                        for (const post of postsResponse.data.posts) {
                            yield (0, genesys_1.createOrUpdateExternalContact)(post.author.did, post.author.displayName || post.author.handle, post.author.handle);
                        }
                    }
                    else {
                        logger_1.logger.debug('External contacts feature is disabled, skipping contact creation');
                    }
                    const genesysMessages = yield Promise.all(postsResponse.data.posts.map(post => (0, message_1.blueskyToGenesys)(agent, post)));
                    const ingestionResult = yield (0, genesys_1.ingestMessages)(genesysMessages);
                    // Update Redis with the Genesys conversation ID
                    for (let i = 0; i < newMentions.length; i++) {
                        const notif = newMentions[i];
                        const post = postsResponse.data.posts[i];
                        const record = post.record;
                        const rootUri = record.reply ? record.reply.root.uri : post.uri;
                        const ingestedMessage = ingestionResult.entities.find((e) => e.channel.messageId === notif.uri);
                        if (ingestedMessage) {
                            yield (0, redis_1.setConversationState)(notif.uri, {
                                cid: notif.cid,
                                genesysConversationId: ingestedMessage.id,
                                rootUri: rootUri,
                            });
                        }
                    }
                }
            }
        }
        else {
            logger_1.logger.info('No new notifications.');
        }
    }
    catch (error) {
        logger_1.logger.error('Error processing notifications:', error);
    }
});
const startInboundPolling = () => {
    logger_1.logger.info('Starting inbound polling...');
    setInterval(processNotifications, POLLING_INTERVAL_MS);
    processNotifications();
};
exports.startInboundPolling = startInboundPolling;
