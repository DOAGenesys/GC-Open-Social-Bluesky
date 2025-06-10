# Bluesky-Genesys Cloud Connector

This middleware application provides a seamless integration between the Bluesky social media platform and the Genesys Cloud contact center solution. It allows organizations to manage their Bluesky presence as a customer service channel directly within Genesys Cloud.

## Project Description

The Bluesky-Genesys Cloud Connector is a TypeScript-based middleware designed to run on the DigitalOcean App Platform. It leverages the Bluesky API and the Genesys Cloud Open Social Messaging protocol to enable two-way communication between the platforms.

**Key Features:**

* **Bluesky to Genesys Cloud:** Ingests Bluesky posts, replies, likes, and reposts into Genesys Cloud.
* **Genesys Cloud to Bluesky:** Allows agents to reply to posts, create new posts, and interact with the Bluesky community (likes, reposts) from the Genesys Cloud interface.
* **Rich Content Handling:** Supports text, images, and embedded links.
* **Social Listening:** Monitors Bluesky for keywords, hashtags, and mentions.
* **Identity Management:** Maps Bluesky users to Genesys Cloud contacts.
* **Scalable and Secure:** Designed for reliability and security, with stateless architecture and secure credential management.

## Monitoring Scope

The middleware implements two distinct types of monitoring with different scopes:

### 1. Inbound Notifications (Your Account Only)
- **What it monitors**: Only activity directed **at your specific Bluesky account**
- **Includes**: 
  - Direct mentions of your account (e.g., `@yourcompany.bsky.social`)
  - Replies to posts made by your account
- **API Used**: `listNotifications()`
- **Configuration**: Always enabled, uses `BLUESKY_HANDLE` automatically
- **Use Case**: Customer service inquiries directed specifically at your brand

### 2. Social Listening (Entire Bluesky Network)
- **What it monitors**: **All public posts across the entire Bluesky network** that match your search criteria
- **Includes**: 
  - Any post by any user containing your search terms
  - Posts that mention your brand without directly tagging your account
  - Industry conversations, competitor mentions, general sentiment
- **API Used**: `searchPosts()`
- **Configuration**: Requires `BLUESKY_SEARCH_QUERY` environment variable
- **Use Case**: Brand monitoring, competitive intelligence, proactive customer engagement

**⚠️ Important**: Social listening monitors the **entire Bluesky network**, so be specific with your search terms to avoid overwhelming your agents with irrelevant conversations.

**Example Search Queries**:
```bash
# Monitor your brand name
BLUESKY_SEARCH_QUERY="YourCompanyName"

# Monitor customer service keywords
BLUESKY_SEARCH_QUERY="customer service OR support OR help"

# Monitor your industry
BLUESKY_SEARCH_QUERY="#fintech OR #banking OR financial services"
```

## Architecture Overview

The middleware consists of the following components:

1.  **Bluesky API Client:** Uses the `@atproto/api` SDK to interact with the Bluesky network.
2.  **Genesys Cloud API Client:** Makes raw HTTP requests to the Genesys Cloud API using `axios`. Not using javascript SDK because some of the required endpoints are not yet in the SDK (very recent).
3.  **Webhook Server:** A secure endpoint to receive outbound messages and events from Genesys Cloud.
4.  **State Management:** A Redis database (Upstash, for example, which has a free tier available) to maintain conversation state and mappings between Bluesky and Genesys Cloud entities.
5.  **Main Application Logic:** The core processing engine that handles data transformation, routing, and business logic.

## The Critical Role of the Database

Based on the requirements and the capabilities of both the Bluesky and Genesys Cloud APIs, building a middleware that meets all the specified features **is not feasible without a database** or a similar persistent storage mechanism (like the Redis instance used here).

The database is not an optional add-on; it's a core architectural component. Here's a breakdown of why it is mandatory for this integration:

### 1. Conversation Threading
*   **The Problem:** When an agent replies to a Bluesky post from within Genesys Cloud, the middleware receives that reply via a webhook. To post it correctly on Bluesky, the API requires the `uri` and `cid` (Content ID) of both the **parent post** and the **root post** of the thread.
*   **The Solution:** This `uri` and `cid` information is unique to Bluesky and is not stored or passed back by Genesys Cloud. The middleware must store this context when it first ingests the post. The database maps a `genesysConversationId` to the corresponding Bluesky `parent` and `root` data, giving the middleware the "memory" it needs to construct a valid, threaded reply.

### 2. Preventing Duplicate Interactions (Idempotency)
*   **The Problem:** The middleware will poll Bluesky periodically for new mentions and posts. Without a way to remember which posts it has already processed, it would re-ingest the same posts every time it polls, creating a flood of duplicate conversations for agents.
*   **The Solution:** The database is used to keep a record of every processed post's unique Bluesky `uri`. Before ingesting a new post, the middleware checks if the `uri` already exists in the database. If it does, the post is skipped, ensuring each Bluesky post creates only one Genesys Cloud interaction.

### 3. Mapping Agent Actions (Likes/Reposts)
*   **The Problem:** The requirements state that an agent should be able to "like" or "repost" from within Genesys Cloud (e.g., by sending a `!like` command). The webhook for this command will tell the middleware which Genesys Cloud `conversationId` it belongs to.
*   **The Solution:** The middleware must translate "like the post in this Genesys conversation" to "like the specific post on Bluesky". This requires a database mapping the `conversationId` back to the original Bluesky post's `uri` and `cid`. Without this mapping, the middleware has no way of knowing which post on Bluesky to interact with.

### 4. System Resilience and Decoupling
*   **The Problem:** External systems can experience downtime. The connection to the Genesys Cloud webhook endpoint could be temporarily interrupted.
*   **The Solution:** A database decouples the inbound (Bluesky polling) and outbound (Genesys Cloud webhooks) flows. If the webhook listener is down, the poller can continue to fetch and store new Bluesys posts in the database. Once the webhook service is restored, it can process the backlog. This makes the entire system more resilient and prevents data loss during partial outages. It also provides a foundation for sophisticated retry mechanisms for any failed API calls.

### 5. Efficiency and Rate Limit Management
*   **The Problem:** Both Bluesky and Genesys Cloud enforce API rate limits. Polling for all historical posts on every startup is inefficient and risks hitting these limits.
*   **The Solution:** The database can store a timestamp or a cursor from the last successful polling operation. On restart, the middleware can query Bluesky only for posts created *after* this point, making the process significantly more efficient and ensuring it stays well within API rate limits.

### 6. Foundation for Future Enhancements
*   **The Problem:** The current feature set is an MVP. Future requirements may include advanced analytics, more complex agent workflows, or richer content handling.
*   **The Solution:** A database provides a flexible and scalable foundation for future growth. It can be used to store historical interaction data, user profile information (to reduce redundant API calls), or manage the state of complex, multi-step agent actions without requiring a major architectural redesign.

## Pre-deployment Configuration

Before deploying the middleware, you must perform several manual configuration steps in both Bluesky and Genesys Cloud to gather the required environment variables.

### Step 1: Bluesky Configuration

1.  **Create App Password:**
    * Log in to the Bluesky account you want to integrate.
    * Navigate to **Settings** > **App Passwords**.
    * Click **Add App Password**, give it a descriptive name (e.g., `genesys-cloud-middleware`), and click **Create**.
    * Copy the generated password. This will be your `BLUESKY_APP_PASSWORD`. **You will not see this password again.**
    * The handle of this account (e.g., `my-company.bsky.social`) will be your `BLUESKY_HANDLE`.

### Step 2: Genesys Cloud Configuration

#### 2.1: Create OAuth Client

1.  Navigate to **Admin** > **Integrations** > **OAuth**.
2.  Click **Add Client**.
3.  Enter a name (e.g., `Bluesky Middleware Client`) and select **Client Credentials**.
4.  Switch to the **Roles** tab and assign a role that has the following permissions at a minimum:
    * `socialmedia*` (all permissions)
    * `externalContacts*` (all permissions)
    * `conversation:message:create`
    * `conversation:communication:create`
    * `messaging:integration:*`
5.  Click **Save**.
6.  You will see a **Client ID** and **Client Secret**. These are your `GC_CC_CLIENT_ID` and `GC_CC_CLIENT_SECRET` variables.

#### 2.2: Create Open Messaging Integration

1.  Navigate to **Admin** > **Message** > **Integrations**.
2.  Click **+ New Integration** and select **Open Messaging**.
3.  Give it a name (e.g., `Bluesky Integration`) and click **Save**.
4.  In the integration's configuration page, copy the **Integration ID**. This is your `GC_INTEGRATION_ID`.
5.  Scroll down to the **Outbound** section and find the **Outbound Webhook Signature Secret Token**. Click **View** and copy the token. This is your `GC_WEBHOOK_SECRET`.

#### 2.3: Set Up Social Listening

1.  Navigate to **Admin** > **Social Media**.
2.  Create a new **Topic** (e.g., `Bluesky Mentions`). Copy its ID for your `GC_SOCIAL_TOPIC_ID`.
3.  Inside the new Topic, create a new **Open Data Ingestion Rule**. Copy its ID for your `GC_SOCIAL_RULE_ID`.
4.  Within this rule, you can define **escalation rules** to automatically create ACD conversations when certain criteria are met.

#### 2.4: Configure Identity Resolution

1.  Navigate to **Admin** > **External Contacts**.
2.  Click **Add Source** and create a new source named `Bluesky`.
3.  Navigate back to **Admin** > **Message** > **Identity Resolution**.
4.  Find your Open Messaging integration and configure it to use the `Bluesky` external source you just created.

## Deployment

This application is designed to be deployed on the **DigitalOcean App Platform**.

1.  Fork this repository.
2.  Create a new App on the DigitalOcean App Platform and connect it to your forked repository.
3.  Configure the required environment variables in the DigitalOcean UI (see below).
4.  Deploy the application.

## Environment Variables

The following environment variables are required for the application to function correctly. These should be configured in the DigitalOcean App Platform's environment settings.

| Variable | Description | Example |
| --- | --- | --- |
| `BLUESKY_HANDLE` | The handle of the Bluesky account to be integrated. | `mycompany.bsky.social` |
| `BLUESKY_APP_PASSWORD` | An app password for the Bluesky account. **Do not use the main account password.** | `xxxx-xxxx-xxxx-xxxx` |
| `GC_REGION` | The Genesys Cloud region (e.g., `mypurecloud.com`, `mypurecloud.ie`). | `mypurecloud.com` |
| `GC_CC_CLIENT_ID` | The Client ID for the Genesys Cloud OAuth Client Credentials grant. | `your-gc-client-id` |
| `GC_CC_CLIENT_SECRET` | The Client Secret for the Genesys Cloud OAuth Client Credentials grant. | `your-gc-client-secret` |
| `GC_INTEGRATION_ID` | The ID of the Open Messaging integration in Genesys Cloud. | `your-gc-integration-id` |
| `GC_WEBHOOK_SECRET` | The secret token for validating outbound webhooks from Genesys Cloud. | `your-webhook-secret` |
| `GC_SOCIAL_TOPIC_ID` | The ID of the Social Listening Topic in Genesys Cloud for ingesting Bluesky posts. | `your-gc-topic-id` |
| `GC_SOCIAL_RULE_ID` | The ID of the Open Data Ingestion Rule in Genesys Cloud. | `your-gc-rule-id` |
| `REDIS_URL` | The connection URL for the Upstash Redis database. | `redis://...` |
| `REDIS_TOKEN` | The authentication token for the Upstash Redis database. | `your-redis-token` |
| `LOG_LEVEL` | The logging level for the application (`debug`, `info`, `warn`, `error`). | `info` |
| `BLUESKY_SEARCH_QUERY` | Search terms for social listening on Bluesky. Uses Bluesky's search syntax. Leave empty to disable social listening. | `"@mycompany OR #support"` |
| `POLLING_TIME_SOCIAL_LISTENING` | The polling interval in seconds for social listening. Defaults to 300 (5 minutes). | `300` |
| `POLLING_TIME_INBOUND_NOTIFICATIONS` | The polling interval in seconds for inbound notifications (mentions/replies). Defaults to 60 (1 minute). | `60` |

## Testing the Integration

Once the middleware is deployed and running with the correct environment variables, you can test the end-to-end flow.

### Test 1: Inbound Post and Agent Reply

1.  **Send a Mention:** From a separate Bluesky account (not the one integrated), create a new post that mentions your integrated account (e.g., "Hello `@mycompany.bsky.social`, I need help!").
2.  **Verify Ingestion:** Log in to Genesys Cloud as an agent and go on queue. Within a few minutes (depending on the polling interval), a new interaction should be routed to you. The interaction should contain the text from the Bluesky post.
3.  **Send a Reply:** Accept the interaction and send a reply through the Genesys Cloud agent interface (e.g., "We're happy to help! What is the issue?").
4.  **Verify Reply on Bluesky:** Check Bluesky. Your reply should appear as a direct response to the original post.

### Test 2: Social Listening and Escalation

1.  **Configure Escalation:** In Genesys Cloud, set up a social listening escalation rule for your ingestion rule (e.g., escalate any post containing the keyword "urgent").
2.  **Post to Bluesky:** From any Bluesky account, create a post containing the keyword (e.g., "This is an urgent issue with my order!").
3.  **Verify Escalation:** The middleware should ingest this post, and the escalation rule should trigger a new interaction to be routed to the appropriate queue in Genesys Cloud.

### Test 3: Agent Interaction (Like)

1.  **Define Agent Command:** Ensure your middleware is configured to recognize a command like `!like`.
2.  **Send Command:** While handling an active interaction (from Test 1), have the agent send the message `!like` as a response.
3.  **Verify Action:** Check the original post on Bluesky. The integrated account (`mycompany.bsky.social`) should have now "liked" that post.