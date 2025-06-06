import { getBlueskyAgent } from '../services/bluesky';
import { ingestMessages, createOrUpdateExternalContact } from '../services/genesys';
import { blueskyToGenesys } from '../mappers/message';
import { getConversationState, setConversationState } from '../services/redis';
import { logger } from '../services/logger';

const POLLING_INTERVAL_MS = 300000; // 5 minutes
const { BLUESKY_SEARCH_QUERY } = process.env;

let socialListeningCursor: string | undefined = undefined;

const processSocialListening = async () => {
    if (!BLUESKY_SEARCH_QUERY) {
        logger.info('No search query for social listening, skipping.');
        return;
    }

    try {
        const agent = await getBlueskyAgent();
        const response = await agent.app.bsky.feed.searchPosts({ q: BLUESKY_SEARCH_QUERY, cursor: socialListeningCursor });

        if (response.data.posts.length > 0) {
            logger.info(`Found ${response.data.posts.length} posts from social listening.`);
            socialListeningCursor = response.data.cursor;

            const newPosts = [];
            for (const post of response.data.posts) {
                const state = await getConversationState(post.uri);
                if (!state) {
                    newPosts.push(post);
                } else {
                    logger.debug(`Skipping already processed post from social listening: ${post.uri}`);
                }
            }

            if (newPosts.length > 0) {
                // Create/update contacts first
                for (const post of newPosts) {
                    await createOrUpdateExternalContact(post.author.did, post.author.displayName || post.author.handle, post.author.handle);
                }

                const genesysMessages = await Promise.all(newPosts.map(post => blueskyToGenesys(agent, post)));
                const ingestionResult = await ingestMessages(genesysMessages);

                // Update Redis with the Genesys conversation ID
                for (let i = 0; i < newPosts.length; i++) {
                    const post = newPosts[i];
                    const ingestedMessage = ingestionResult.entities.find((e: any) => e.channel.messageId === post.uri);
                    if (ingestedMessage) {
                        await setConversationState(post.uri, {
                            cid: post.cid,
                            genesysConversationId: ingestedMessage.id,
                            rootUri: post.uri, // Social listening posts are always roots
                        });
                    }
                }
            }

        } else {
            logger.info('No new posts found from social listening.');
        }
    } catch (error) {
        logger.error('Error processing social listening:', error);
    }
}


export const startSocialListening = () => {
    logger.info('Starting social listening...');
    setInterval(processSocialListening, POLLING_INTERVAL_MS);
    processSocialListening();
}; 