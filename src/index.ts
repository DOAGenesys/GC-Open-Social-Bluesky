import express from 'express';
import { startInboundPolling } from './jobs/inbound';
import { startSocialListening } from './jobs/social-listening';
import { startDMPolling } from './jobs/dm-polling';
import { webhookRouter } from './middleware/webhook';
import { logger } from './services/logger';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.use('/webhook', webhookRouter);

app.listen(port, () => {
  logger.info(`Server is running on port ${port}`);
  startInboundPolling();
  startSocialListening();
  startDMPolling();
}); 