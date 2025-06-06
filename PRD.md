Product Requirements Document: Bluesky-Genesys Cloud Connector
1. Overview
This document outlines the product requirements for a middleware application, the Bluesky-Genesys Cloud Connector. This connector will bridge the communication gap between the decentralized social media platform, Bluesky, and the Genesys Cloud contact center platform. The primary goal is to enable organizations to manage their Bluesky presence, engage with their audience, and handle customer interactions originating from Bluesky within the familiar Genesys Cloud agent interface.
2. Goals

Enable Bluesky as a Customer Service Channel: Allow businesses to use their Bluesky account as a fully-fledged customer service channel within Genesys Cloud.
Centralize Social Media Management: Consolidate customer interactions from Bluesky alongside other communication channels (voice, email, chat) in Genesys Cloud.
Enhance Agent Productivity: Empower Genesys Cloud agents to handle Bluesky interactions without needing to switch between different applications, using their existing workflows and tools.
Leverage Genesys Cloud Analytics: Provide supervisors and managers with insights into Bluesky interactions through Genesys Cloud's reporting and analytics capabilities.
Feature-Rich Integration: Maximize the synergies between Bluesky's rich social features and Genesys Cloud's powerful contact center functionalities.

3. User Stories
As a Genesys Cloud Agent, I want to:

Receive new Bluesky posts and replies in my Genesys Cloud queue.
View the full content of a Bluesky post, including text, images, and embedded links, within the Genesys Cloud interface.
Reply to Bluesky posts directly from Genesys Cloud.
See the entire conversation thread (original post and replies) to understand the context of an interaction.
Be able to "like" and "repost" a Bluesky post from the Genesys Cloud interface to engage with the community.

As a Contact Center Supervisor, I want to:

Monitor incoming Bluesky posts for specific keywords, hashtags, or mentions of our brand using Genesys Cloud's social listening capabilities.
Create escalation rules to automatically route prestação-priority Bluesky posts to the appropriate queue or agent.
Track agent performance and interaction metrics for the Bluesky channel in Genesys Cloud's performance dashboards.
View conversation transcripts and interaction details for quality management and training purposes.

As a System Administrator, I want to:

Easily deploy and configure the middleware on DigitalOcean's App Platform.
Securely manage API credentials and other sensitive information using environment variables.
Have a reliable and scalable solution that can handle a high volume of Bluesky interactions.
Be able to monitor the health and performance of the middleware application.

4. Features
4.1. Core Functionality

Inbound Message Routing: Ingest Bluesky posts, replies, and quote posts into Genesys Cloud as open social messages.
Outbound Messaging: Allow agents to send replies, quote posts, and new posts to Bluesky from Genesys Cloud.
Rich Content Support: Handle text, images, links, and other embed types supported by Bluesky, translating them into a format compatible with Genesys Cloud.
Conversation Threading: Maintain the context of Bluesky conversations by correctly mapping replies to their parent and root posts.
Social Interactions: Enable agents to "like" and "repost" Bluesky posts, which will be mapped to Genesys Cloud reactions.

4.2. Social Listening

Keyword and Hashtag Monitoring: Continuously monitor Bluesky for predefined keywords, hashtags, and user mentions.
Real-time Ingestion: Ingest matching Bluesky posts into a dedicated Genesys Cloud social listening topic for analysis and potential escalation.

4.3. Identity and Profile Management

User Identity Resolution: Map Bluesky user handles and DIDs to Genesys Cloud external contacts.
Profile Enrichment: Display Bluesky user profile information (display name, handle, avatar, bio) within the Genesys Cloud agent interface.

4.4. State Management

Conversation State: Use a Redis database (Upstash) to maintain the state of ongoing conversations, including mapping Bluesky post URIs and CIDs to Genesys Cloud conversation IDs.
Idempotency: Ensure that the same Bluesky post is not ingested into Genesys Cloud multiple times.

4.5. Security and Reliability

Secure Credential Management: Store all API keys, secrets, and other sensitive information in environment variables.
Webhook Validation: Securely validate all incoming webhooks from Genesys Cloud using a shared secret.
Error Handling and Retries: Implement robust error handling and a webhook retry policy to ensure reliable message delivery.
Scalability: The middleware will be designed to be stateless (with state offloaded to Redis) and horizontally scalable on the DigitalOcean App Platform.

5. Non-Functional Requirements

Performance: The middleware must be able to handle a high volume of interactions with low latency.
Scalability: The application should be designed to scale horizontally to accommodate growing workloads.
Reliability: The middleware must be reliable and resilient, with mechanisms for error recovery and retries.
Security: All communication between Bluesky, the middleware, and Genesys Cloud must be secure. Sensitive data must be handled and stored securely.
Deployability: The application should be easy to deploy and manage on the DigitalOcean App Platform.

6. Assumptions and Dependencies

The client will have a Bluesky developer account with the necessary permissions to use the API.
The client will have a Genesys Cloud organization with the appropriate licenses for Open Messaging and Social Listening.
The middleware will be deployed on a server environment (e.g., DigitalOcean App Platform) with support for Node.js and environment variable configuration.
A Redis database (Upstash) will be used for state management.

