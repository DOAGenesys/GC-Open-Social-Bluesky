import { getBlueskyAgent } from '../services/bluesky';
import { getConversationState, setConversationState } from '../services/redis';
import { blueskyToGenesys } from '../mappers/message';
import {AppBskyFeedDefs, AppBskyFeedPost} from "@atproto/api";
import { ingestMessages, createOrUpdateExternalContact } from '../services/genesys';
import { logger } from '../services/logger';

const { POLLING_TIME_INBOUND_NOTIFICATIONS } = process.env;
const POLLING_INTERVAL_MS = POLLING_TIME_INBOUND_NOTIFICATIONS ? parseInt(POLLING_TIME_INBOUND_NOTIFICATIONS, 10) * 1000 : 60000; // 1 minute default

let lastSeenNotif: string | undefined = undefined;

const processNotifications = async () => {
  try {
    const agent = await getBlueskyAgent();
    const notifications = await agent.listNotifications({ cursor: lastSeenNotif });

    if (notifications.data.notifications.length > 0) {
      logger.info(`Fetched ${notifications.data.notifications.length} new notifications.`);
      lastSeenNotif = notifications.data.cursor;

      const newMentions = [];

      for (const notif of notifications.data.notifications) {
        if (notif.reason === 'mention' || notif.reason === 'reply') {
          const state = await getConversationState(notif.uri);
          if (state) {
            logger.debug(`Skipping already processed post: ${notif.uri}`);
            continue;
          }
          newMentions.push(notif);
        }
      }

      if (newMentions.length > 0) {
        const postsResponse = await agent.getPosts({ uris: newMentions.map(n => n.uri) });
        if (postsResponse.data.posts) {
            // Create/update contacts first
            for (const post of postsResponse.data.posts) {
                await createOrUpdateExternalContact(post.author.did, post.author.displayName || post.author.handle, post.author.handle);
            }

            const genesysMessages = await Promise.all(postsResponse.data.posts.map(post => blueskyToGenesys(agent, post)));
            const ingestionResult = await ingestMessages(genesysMessages);

            // Update Redis with the Genesys conversation ID
            for (let i = 0; i < newMentions.length; i++) {
                const notif = newMentions[i];
                const post = postsResponse.data.posts[i];
                const record = post.record as AppBskyFeedPost.Record;
                const rootUri = record.reply ? record.reply.root.uri : post.uri;

                const ingestedMessage = ingestionResult.entities.find((e: any) => e.channel.messageId === notif.uri);
                if (ingestedMessage) {
                    await setConversationState(notif.uri, {
                        cid: notif.cid,
                        genesysConversationId: ingestedMessage.id,
                        rootUri: rootUri,
                    });
                }
            }
        }
      }

    } else {
      logger.info('No new notifications.');
    }
  } catch (error) {
    logger.error('Error processing notifications:', error);
  }
};

export const startInboundPolling = () => {
  logger.info('Starting inbound polling...');
  setInterval(processNotifications, POLLING_INTERVAL_MS);
  processNotifications();
};
