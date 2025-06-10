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
  
  // Start all polling jobs with enhanced logging
  logger.info('Starting all polling jobs...');
  
  try {
    startInboundPolling();
    logger.info('Inbound polling started successfully');
  } catch (error) {
    logger.error('Failed to start inbound polling:', error);
  }
  
  try {
    startSocialListening();
    logger.info('Social listening started successfully');
  } catch (error) {
    logger.error('Failed to start social listening:', error);
  }
  
  try {
    startDMPolling();
    logger.info('DM polling started successfully');
  } catch (error) {
    logger.error('Failed to start DM polling:', error);
  }
  
  logger.info('All services initialized');
}); 