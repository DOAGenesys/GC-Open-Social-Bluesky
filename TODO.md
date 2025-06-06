Bluesky-Genesys Cloud Connector: TODO List
This document outlines the development tasks for the project, broken down by component and priority.
Phase 1: Core Infrastructure and Inbound Messaging

 Project Setup:
 - [x] Initialize a new TypeScript project.
 - [x] Install all necessary dependencies (@atproto/api, axios for raw API calls, @upstash/redis, etc.).
 - [x] Set up ESLint and Prettier for code quality.


 Authentication Modules:
 - [x] Implement a singleton module for the Bluesky BskyAgent.
 - [x] Implement a module for handling OAuth Client Credentials flow to obtain access tokens for Genesys Cloud API.


 Redis Integration:
 - [x] Set up a client for connecting to the Upstash Redis database.
 - [x] Implement functions for storing and retrieving conversation state.


 Inbound Message Flow:
 - [x] Implement a polling mechanism to fetch new mentions and posts from Bluesky.
 - [x] Develop the data transformation logic to convert Bluesky posts to the Genesys Cloud OpenSocialMessage format.
 - [x] Handle image attachments: download, store temporarily, and include as public URLs.
 - [x] Implement the logic for ingesting messages into Genesys Cloud using raw API callouts to the bulk messages endpoint.
 - [x] Implement idempotency checks using Redis to prevent duplicate messages.



Phase 2: Outbound Messaging and Basic Interactions

 Webhook Server:
 - [x] Create a secure webhook endpoint to receive outbound messages from Genesys Cloud.
 - [x] Implement webhook signature validation.


 Outbound Reply Logic:
 - [x] Parse incoming webhooks from Genesys Cloud.
 - [x] Retrieve conversation context (parent post URI/CID) from Redis.
 - [x] Implement the logic to post replies to Bluesky using the @atproto/api.


 Message Receipts:
 - [x] Implement sending Delivered receipts to Genesys Cloud using raw API callouts upon successful posting to Bluesky.
 - [x] Implement sending Failed receipts with error details if posting to Bluesky fails.


 Like and Repost from Agent:
 - [x] Define a command syntax for agents (e.g., !like, !repost).
 - [x] Implement the logic to parse these commands from outbound messages.
 - [x] Use the Bluesky API to perform "like" and "repost" actions.



Phase 3: Advanced Features and Finalization

 Social Listening:
 - [x] Implement a separate polling mechanism for monitoring Bluesky based on keywords/hashtags.
 - [x] Ingest matching posts into the configured Genesys Cloud Social Listening Topic using raw API callouts.


 Identity Resolution:
 - [x] Implement the logic to create/update external contacts in Genesys Cloud using raw API callouts for new Bluesky users.
 - [x] Ensure that the Bluesky DID is used as the unique identifier.


 Rich Content Handling (Advanced):
 - [x] Enhance the handling of quote posts and external link embeds, formatting them for clear display in Genesys Cloud.


 Error Handling and Logging:
 - [x] Implement comprehensive error handling across all components.
 - [x] Add detailed logging with configurable log levels.


 Deployment and Documentation:
 - [x] Write detailed setup and deployment instructions for DigitalOcean App Platform.
 - [x] Finalize and review all *.md files.
 - [x] Mark all tasks as done.



Future Enhancements (Post-MVP)

 - [ ] Future Enhancements (Post-MVP)
 - [ ] Implement real-time updates using Bluesky's subscription API (firehose) instead of polling.
 - [ ] Support for creating new Bluesky posts with images from Genesys Cloud.
 - [ ] More advanced social listening and analytics integrations.
 - [ ] Support for Bluesky user lists and moderation features.

