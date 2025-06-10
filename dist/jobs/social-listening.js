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
exports.startSocialListening = void 0;
const bluesky_1 = require("../services/bluesky");
const genesys_1 = require("../services/genesys");
const message_1 = require("../mappers/message");
const redis_1 = require("../services/redis");
const logger_1 = require("../services/logger");
const { POLLING_TIME_SOCIAL_LISTENING, BLUESKY_SEARCH_QUERY } = process.env;
const POLLING_INTERVAL_MS = POLLING_TIME_SOCIAL_LISTENING ? parseInt(POLLING_TIME_SOCIAL_LISTENING, 10) * 1000 : 300000; // 5 minutes default
let socialListeningCursor = undefined;
const processSocialListening = () => __awaiter(void 0, void 0, void 0, function* () {
    if (!BLUESKY_SEARCH_QUERY) {
        logger_1.logger.info('No search query for social listening, skipping.');
        return;
    }
    try {
        const agent = yield (0, bluesky_1.getBlueskyAgent)();
        logger_1.logger.info(`Social listening search query: "${BLUESKY_SEARCH_QUERY}"`);
        logger_1.logger.debug(`Social listening cursor: ${socialListeningCursor || 'none (first poll)'}`);
        const searchParams = { q: BLUESKY_SEARCH_QUERY, cursor: socialListeningCursor };
        logger_1.logger.debug(`Bluesky search request params:`, searchParams);
        const response = yield agent.app.bsky.feed.searchPosts(searchParams);
        logger_1.logger.debug(`Bluesky search response - posts found: ${response.data.posts.length}, cursor: ${response.data.cursor || 'none'}`);
        logger_1.logger.debug(`Full search response metadata:`, {
            postsCount: response.data.posts.length,
            cursor: response.data.cursor,
            hasHeaders: !!response.headers,
            status: response.success
        });
        if (response.data.posts.length > 0) {
            logger_1.logger.info(`Found ${response.data.posts.length} posts from social listening.`);
            socialListeningCursor = response.data.cursor;
            // Log details about found posts
            for (const post of response.data.posts) {
                const record = post.record; // Handle dynamic record type
                const textPreview = (record === null || record === void 0 ? void 0 : record.text) ? record.text.substring(0, 100) : 'No text content';
                logger_1.logger.debug(`Found post: ${post.uri} by @${post.author.handle} - "${textPreview}..."`);
            }
            const newPosts = [];
            for (const post of response.data.posts) {
                const state = yield (0, redis_1.getConversationState)(post.uri);
                if (!state) {
                    newPosts.push(post);
                    logger_1.logger.debug(`Post ${post.uri} is new, will be processed`);
                }
                else {
                    logger_1.logger.debug(`Skipping already processed post from social listening: ${post.uri}`);
                }
            }
            logger_1.logger.debug(`Total posts to process: ${newPosts.length} (out of ${response.data.posts.length} found)`);
            if (newPosts.length > 0) {
                // Create/update contacts first (only if enabled)
                const { ENABLE_EXTERNAL_CONTACTS } = process.env;
                if (ENABLE_EXTERNAL_CONTACTS === 'true') {
                    logger_1.logger.debug('External contacts feature is enabled, creating/updating contacts...');
                    for (const post of newPosts) {
                        logger_1.logger.debug(`Creating/updating contact for user: ${post.author.did} (@${post.author.handle})`);
                        yield (0, genesys_1.createOrUpdateExternalContact)(post.author.did, post.author.displayName || post.author.handle, post.author.handle);
                    }
                }
                else {
                    logger_1.logger.debug('External contacts feature is disabled, skipping contact creation');
                }
                logger_1.logger.debug(`Converting ${newPosts.length} posts to Genesys messages...`);
                const genesysMessages = yield Promise.all(newPosts.map(post => (0, message_1.blueskyToGenesys)(agent, post)));
                logger_1.logger.debug(`Ingesting ${genesysMessages.length} messages into Genesys Cloud...`);
                const ingestionResult = yield (0, genesys_1.ingestMessages)(genesysMessages);
                logger_1.logger.debug(`Ingestion result:`, ingestionResult);
                // Update Redis with the Genesys conversation ID
                for (let i = 0; i < newPosts.length; i++) {
                    const post = newPosts[i];
                    const ingestedMessage = ingestionResult.entities.find((e) => e.channel.messageId === post.uri);
                    if (ingestedMessage) {
                        // Check if post.cid exists, if not log available properties
                        if (!post.cid) {
                            logger_1.logger.warn(`Post ${post.uri} missing cid property. Available properties:`, Object.keys(post));
                            logger_1.logger.debug(`Full post object:`, post);
                        }
                        const state = {
                            cid: post.cid || 'unknown', // Fallback if cid is missing
                            genesysConversationId: ingestedMessage.id,
                            rootUri: post.uri, // Social listening posts are always roots
                        };
                        logger_1.logger.debug(`Storing conversation state for ${post.uri}:`, state);
                        yield (0, redis_1.setConversationState)(post.uri, state);
                    }
                    else {
                        logger_1.logger.debug(`No ingested message found for post ${post.uri} in ingestion result`);
                    }
                }
                logger_1.logger.info(`Successfully processed ${newPosts.length} new posts from social listening`);
            }
            else {
                logger_1.logger.debug('All found posts were already processed, no new posts to ingest');
            }
        }
        else {
            logger_1.logger.info(`No new posts found from social listening. Search query was: "${BLUESKY_SEARCH_QUERY}"`);
            logger_1.logger.debug(`Search completed with cursor: ${socialListeningCursor || 'none'}`);
        }
    }
    catch (error) {
        logger_1.logger.error('Error processing social listening:', error);
        logger_1.logger.debug('Social listening error details:', {
            query: BLUESKY_SEARCH_QUERY,
            cursor: socialListeningCursor,
            error: (error === null || error === void 0 ? void 0 : error.message) || 'Unknown error',
            stack: (error === null || error === void 0 ? void 0 : error.stack) || 'No stack trace'
        });
    }
});
const startSocialListening = () => {
    logger_1.logger.info('Starting social listening...');
    setInterval(processSocialListening, POLLING_INTERVAL_MS);
    processSocialListening();
};
exports.startSocialListening = startSocialListening;
