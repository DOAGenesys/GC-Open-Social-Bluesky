import { getBlueskyAgent } from '../services/bluesky';
import { ingestMessages, createOrUpdateExternalContact } from '../services/genesys';
import { blueskyToGenesys } from '../mappers/message';
import { getConversationState, setConversationState } from '../services/redis';
import { logger } from '../services/logger';

const { POLLING_TIME_SOCIAL_LISTENING, BLUESKY_SEARCH_QUERY } = process.env;
const POLLING_INTERVAL_MS = POLLING_TIME_SOCIAL_LISTENING ? parseInt(POLLING_TIME_SOCIAL_LISTENING, 10) * 1000 : 300000; // 5 minutes default

let socialListeningCursor: string | undefined = undefined;

const processSocialListening = async () => {
    if (!BLUESKY_SEARCH_QUERY) {
        logger.info('No search query for social listening, skipping.');
        return;
    }

    try {
        const agent = await getBlueskyAgent();
        logger.info(`Social listening search query: "${BLUESKY_SEARCH_QUERY}"`);
        logger.debug(`Social listening cursor: ${socialListeningCursor || 'none (first poll)'}`);
        
        const searchParams = { q: BLUESKY_SEARCH_QUERY, cursor: socialListeningCursor };
        logger.debug(`Bluesky search request params:`, searchParams);
        
        const response = await agent.app.bsky.feed.searchPosts(searchParams);
        
        logger.debug(`Bluesky search response - posts found: ${response.data.posts.length}, cursor: ${response.data.cursor || 'none'}`);

        if (response.data.posts.length > 0) {
            logger.info(`Found ${response.data.posts.length} posts from social listening.`);
            socialListeningCursor = response.data.cursor;

            // Log details about found posts
            for (const post of response.data.posts) {
                const record = post.record as any; // Handle dynamic record type
                const textPreview = record?.text ? record.text.substring(0, 100) : 'No text content';
                logger.debug(`Found post: ${post.uri} by @${post.author.handle} - "${textPreview}..."`);
            }

            const newPosts = [];
            for (const post of response.data.posts) {
                const state = await getConversationState(post.uri);
                if (!state) {
                    newPosts.push(post);
                    logger.debug(`Post ${post.uri} is new, will be processed`);
                } else {
                    logger.debug(`Skipping already processed post from social listening: ${post.uri}`);
                }
            }

            logger.debug(`Total posts to process: ${newPosts.length} (out of ${response.data.posts.length} found)`);

            if (newPosts.length > 0) {
                // Create/update contacts first
                for (const post of newPosts) {
                    logger.debug(`Creating/updating contact for user: ${post.author.did} (@${post.author.handle})`);
                    await createOrUpdateExternalContact(post.author.did, post.author.displayName || post.author.handle, post.author.handle);
                }

                logger.debug(`Converting ${newPosts.length} posts to Genesys messages...`);
                const genesysMessages = await Promise.all(newPosts.map(post => blueskyToGenesys(agent, post)));
                
                logger.debug(`Ingesting ${genesysMessages.length} messages into Genesys Cloud...`);
                const ingestionResult = await ingestMessages(genesysMessages);
                logger.debug(`Ingestion result:`, ingestionResult);

                // Update Redis with the Genesys conversation ID
                for (let i = 0; i < newPosts.length; i++) {
                    const post = newPosts[i];
                    const ingestedMessage = ingestionResult.entities.find((e: any) => e.channel.messageId === post.uri);
                    if (ingestedMessage) {
                        const state = {
                            cid: post.cid,
                            genesysConversationId: ingestedMessage.id,
                            rootUri: post.uri, // Social listening posts are always roots
                        };
                        logger.debug(`Storing conversation state for ${post.uri}:`, state);
                        await setConversationState(post.uri, state);
                    } else {
                        logger.debug(`No ingested message found for post ${post.uri} in ingestion result`);
                    }
                }
                
                logger.info(`Successfully processed ${newPosts.length} new posts from social listening`);
            } else {
                logger.debug('All found posts were already processed, no new posts to ingest');
            }

        } else {
            logger.info(`No new posts found from social listening. Search query was: "${BLUESKY_SEARCH_QUERY}"`);
            logger.debug(`Search completed with cursor: ${socialListeningCursor || 'none'}`);
        }
    } catch (error: any) {
        logger.error('Error processing social listening:', error);
        logger.debug('Social listening error details:', { 
            query: BLUESKY_SEARCH_QUERY, 
            cursor: socialListeningCursor,
            error: error?.message || 'Unknown error',
            stack: error?.stack || 'No stack trace'
        });
    }
}


export const startSocialListening = () => {
    logger.info('Starting social listening...');
    setInterval(processSocialListening, POLLING_INTERVAL_MS);
    processSocialListening();
}; 