# Bluesky-Genesys Cloud Connector

This middleware application provides a seamless integration between the Bluesky social media platform and the Genesys Cloud contact center solution. It allows organizations to manage their Bluesky presence as a customer service channel directly within Genesys Cloud.

## Project Description

The Bluesky-Genesys Cloud Connector is a TypeScript-based middleware designed to run on the DigitalOcean App Platform. It leverages the Bluesky API and the Genesys Cloud Open Social Messaging protocol to enable two-way communication between the platforms.

**Key Features:**

* **Bluesky to Genesys Cloud:** Ingests Bluesky posts, replies into Genesys Cloud. DMs supported
* **Genesys Cloud to Bluesky:** Allows agents to to reply both public and privately from the Genesys Cloud interface.
* **Social Listening:** Monitors Bluesky for keywords, hashtags, and mentions.
* **Identity Management:** Maps Bluesky users to Genesys Cloud contacts.

## Monitoring Scope

The middleware implements distinct types of monitoring with different scopes:

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

### 3. Direct Message Monitoring (Conversation Responses)
- **What it monitors**: **Direct message responses to DMs you've sent from Genesys Cloud**
- **Includes**:
  - Replies to direct messages sent by agents via Genesys Cloud
  - New direct messages initiated by Bluesky users to your account
- **API Used**: Python `atproto` library with `chat.bsky.convo` (TypeScript SDK doesn't support DMs)
- **Configuration**: Automatically enabled, uses `POLLING_TIME_DM` for polling interval
- **Use Case**: Customer service follow-ups, private customer conversations

**⚠️ Important**: Social listening monitors the **entire Bluesky network**, so be specific with your search terms to avoid overwhelming your agents with irrelevant conversations.

**Example Search Queries**:
```bash
# Monitor your brand name
BLUESKY_SEARCH_QUERY="YourCompanyName"

# Monitor customer service keywords
BLUESKY_SEARCH_QUERY="customer service"
```

## Architecture Overview

The middleware consists of the following components:

1.  **Bluesky API Client:** Uses the `@atproto/api` SDK to interact with the Bluesky network.
2.  **Genesys Cloud API Client:** Makes raw HTTP requests to the Genesys Cloud API using `axios`. Not using javascript SDK because some of the required endpoints are not yet in the SDK (very recent).
3.  **Webhook Server:** A secure endpoint to receive outbound messages and events from Genesys Cloud.
4.  **State Management:** A Redis database (Upstash, for example, which has a free tier available) to maintain conversation state and mappings between Bluesky and Genesys Cloud entities.
5.  **Main Application Logic:** The core processing engine that handles data transformation, routing, and business logic.

### Genesys Cloud API Endpoints Used

The middleware uses two different Genesys Cloud endpoints for ingesting messages, depending on the message type:

#### 1. Social Media Ingestion (Public Posts)
**Endpoint**: `POST /api/v2/socialmedia/topics/{topicId}/dataingestionrules/open/{ruleId}/messages/bulk`

**Used for**:
- Public posts and replies from Bluesky
- Social listening results (posts containing search keywords)
- Mentions and notifications
- **Channel Type**: Only supports `Public` messages

**Environment Variables Required**:
- `GC_SOCIAL_TOPIC_ID` - The social media topic ID
- `GC_SOCIAL_RULE_ID` - The data ingestion rule ID

#### 2. Open Messaging Inbound (Direct Messages)
**Endpoint**: `POST /api/v2/conversations/messages/{integrationId}/inbound/open/message`

**Used for**:
- Direct messages from Bluesky users
- Private conversations initiated by customers
- **Channel Type**: Supports `Private` conversations

**Environment Variables Required**:
- `GC_INTEGRATION_ID` - The Open Messaging integration ID


## The Critical Role of the Database

Based on the requirements and the capabilities of both the Bluesky and Genesys Cloud APIs, building a middleware that meets all the specified features **is not feasible without a database** or a similar persistent storage mechanism (like the Redis instance used here).

The database is not an optional add-on; it's a core architectural component. Here's a breakdown of why it is mandatory for this integration:

### 1. Conversation Threading
*   **The Problem:** When an agent replies to a Bluesky post from within Genesys Cloud, the middleware receives that reply via a webhook. To post it correctly on Bluesky, the API requires the `uri` and `cid` (Content ID) of both the **parent post** and the **root post** of the thread.
*   **The Solution:** This `uri` and `cid` information is unique to Bluesky and is not stored or passed back by Genesys Cloud. The middleware must store this context when it first ingests the post. The database maps a `genesysConversationId` to the corresponding Bluesky `parent` and `root` data, giving the middleware the "memory" it needs to construct a valid, threaded reply.

### 2. Preventing Duplicate Interactions
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

### 6. Example DB setup on upstash (https://upstash.com)

*   **Account:** Create a free account and then a database:
  
![image](https://github.com/user-attachments/assets/8d165443-fda0-46ce-9458-a6e781e87e93)

*   **Properties:** Assign it a name and a region:

  ![image](https://github.com/user-attachments/assets/fb6da156-8c13-4022-8378-c008ef61accf)


*   **Final steps:** Select a plan and create the db. Then get the https URL and the token, you will be needing those to set the REDIS_URL & REDIS_TOKEN env vars on your server (DigitalOcean or similar)

![image](https://github.com/user-attachments/assets/e0e1b2f1-0c9d-41e0-afba-74effe5cd681)



## Pre-deployment Configuration

Before deploying the middleware, you must perform several manual configuration steps in both Bluesky and Genesys Cloud to gather the required environment variables.

### Step 1: Bluesky Configuration

1.  **Create an integration account with an App Password:**
    * Create and log in to the Bluesky account you want to use as the integration account.
    * Navigate to **Settings** > **App Passwords**.
    * Click **Add App Password**, give it a descriptive name (e.g., `genesys-cloud-middleware`), and click **Create**.
    * Copy the generated password. This will be your `BLUESKY_APP_PASSWORD`. **You will not see this password again.**
    * The handle of this account (e.g., `my-company.bsky.social`) will be your `BLUESKY_HANDLE`.
  
2.  **Create a customer account:**
    * Create a customer account that you will use to test the integration. This is where you will interact with Genesys Cloud agents from, by submitting public posts, replies or DMs.

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

1.  Navigate to **Admin** > **Message** > **Platforms**.
2.  Click **+ New** and select **Open Messaging**.
3.  Give it a name (e.g., `Bluesky Integration`) and click **Save**.
4.  In the integration's configuration page, copy the **Integration ID**. This is your `GC_INTEGRATION_ID`.
5.  Scroll down to the **Outbound** section and find the **Outbound Webhook Signature Secret Token**. Click **View** and copy the token. This is your `GC_WEBHOOK_SECRET`.

#### 2.3: Set Up Social Listening

1.  Navigate to **Admin** > **Social Media**.
2.  Create a new **Topic** (e.g., `Bluesky Mentions`). Copy its ID for your `GC_SOCIAL_TOPIC_ID`.
3.  Inside the new Topic, create a new **Open Data Ingestion Rule**. Copy its ID for your `GC_SOCIAL_RULE_ID`.
4.  Within this rule, you can define **escalation rules** to automatically create ACD conversations when certain criteria are met.

#### 2.4: Configure External Source

1.  **Create External Source**:
    - Navigate to **Admin** > **External Sources**
    - Click **Add External Source** and create a new source named `Bluesky`
    - After creating the source, click on it to view its details and copy the **Source ID**
    - This will be your `GC_EXTERNAL_SOURCE_ID` environment variable

#### 2.5: Configure External Contacts (Optional)

If you want to track individual customer profiles (`ENABLE_EXTERNAL_CONTACTS=true`):

1.  **Get Division ID**:
    - Navigate to **Admin** > **Organization** > **Divisions**
    - Find the division where you want to store external contacts (usually "Home" or your main division)
    - Copy the **Division ID** - this will be your `GC_EC_DIVISION_ID` environment variable
  

#### 2.6: Configure Platform Outbound Webhook URL

This MUST be done after the DigitalOcean deployment is finished (see next section) and you get your DigitalOcean app URL.

1.  Navigate to **Admin** > **Message** > **Platforms**, and edit the Platform you created previously. Edit the Outbound Notification Webhook URL with https://<DigitalOcean_App_Domain>/webhook, for example:

![image](https://github.com/user-attachments/assets/5ae6e632-0657-477d-96cb-838e6630d510)


**Understanding External Contacts vs External Sources:**
- **External Source**: A single category/source type (like "Bluesky") that you create once in Genesys Cloud
- **External Contacts**: Individual contact records for each Bluesky user, all linked to the "Bluesky" external source
- Each unique Bluesky user (identified by their DID) gets their own external contact record for customer tracking

## Deployment

This application is designed to be deployed on the **DigitalOcean App Platform**. In case you don't have a DigitalOcean account, you can get one here with $200 free credits:

[![DigitalOcean Referral Badge](https://web-platforms.sfo2.cdn.digitaloceanspaces.com/WWW/Badge%201.svg)](https://www.digitalocean.com/?refcode=e78e0ec0ec1d&utm_campaign=Referral_Invite&utm_medium=Referral_Program&utm_source=badge)

1.  Fork this repository.
2.  Create a new App on the DigitalOcean App Platform and connect it to your forked repository.
3.  Configure the required environment variables in the DigitalOcean UI (see below). Choose your region, app name, and server type (mins specs are enough for testing purposes).
4.  Deploy the application. App should deploy successfully.
5.  Anytime you make a change in the Github repo, or change the value of an env var (see below), it will auto redeploy on DigitalOcean.
6.  You can see runtime logs for troubleshooting in the "Runtime Logs" tab (LOG_LEVEL env var impacts the granularity and verbosity of the logs)

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
| `GC_WEBHOOK_SECRET` | The secret token for validating outbound webhooks from Genesys Cloud. You can get it when configuring the Open Messaging platform on Genesys Cloud ("Outbound Notification Webhook Signature Secret Token") | `your-webhook-secret` |
| `GC_SOCIAL_TOPIC_ID` | The ID of the Social Listening Topic in Genesys Cloud for ingesting Bluesky posts. | `your-gc-topic-id` |
| `GC_SOCIAL_RULE_ID` | The ID of the Open Data Ingestion Rule in Genesys Cloud. | `your-gc-rule-id` |
| `GC_EXTERNAL_SOURCE_ID` | The ID of the "Bluesky" external source in Genesys Cloud (required if `ENABLE_EXTERNAL_CONTACTS=true`). | `your-external-source-id` |
| `GC_EC_DIVISION_ID` | The ID of the division for external contacts in Genesys Cloud (required if `ENABLE_EXTERNAL_CONTACTS=true`). | `your-division-id` |
| `REDIS_URL` | The connection URL for the Upstash Redis database. | `https://...` |
| `REDIS_TOKEN` | The authentication token for the Upstash Redis database. | `your-redis-token` |
| `LOG_LEVEL` | The logging level for the application (`debug`, `info`, `warn`, `error`). | `info` |
| `BLUESKY_SEARCH_QUERY` | Search terms for social listening on Bluesky. Uses Bluesky's search syntax. Leave empty to disable social listening. | `"@mycompany OR #support"` |
| `ENABLE_EXTERNAL_CONTACTS` | Whether to create/update external contacts in Genesys Cloud for each Bluesky user. Set to `false` to skip contact creation entirely. | `true` |
| `POLLING_TIME_SOCIAL_LISTENING` | The polling interval in seconds for social listening. Defaults to 300 (5 minutes). | `300` |
| `POLLING_TIME_INBOUND_NOTIFICATIONS` | The polling interval in seconds for inbound notifications (mentions/replies). Defaults to 60 (1 minute). | `60` |
| `POLLING_TIME_DM` | The polling interval in seconds for direct message polling. Defaults to 120 (2 minutes). | `120` |


## External Contacts Integration

When `ENABLE_EXTERNAL_CONTACTS=true`, the middleware automatically creates and manages external contacts in Genesys Cloud:

### How It Works
- **One External Source**: You create a single "Bluesky" external source in Genesys Cloud (done once)
- **Many External Contacts**: Each unique Bluesky user gets their own individual contact record
- **Unique Identification**: Users are identified by their Bluesky DID (Decentralized Identifier), not their handle

### What Gets Stored
- **Profile Data**: User's display name, handle, and Bluesky DID for identification
- **Customer History**: All posts from the same user are linked to their contact profile
- **Automatic Management**: Creates new contacts when first encountered, updates existing contacts if profile information changes

### Benefits for Customer Service
- Track interaction history with specific users across multiple posts and conversations
- Build customer profiles and context for better service delivery
- Identify repeat customers or frequent posters
- Maintain continuity in customer relationships across different service interactions

### Configuration
- **Required Environment Variables** (when `ENABLE_EXTERNAL_CONTACTS=true`):
  - `GC_EXTERNAL_SOURCE_ID`: The ID of your "Bluesky" external source
  - `GC_EC_DIVISION_ID`: The ID of the division where contacts will be stored
- **Optional Feature**: Set `ENABLE_EXTERNAL_CONTACTS=false` to skip contact creation entirely

**Important**: Each Bluesky user is uniquely identified by their DID (not their handle), ensuring accurate tracking even if users change their display names or handles.
