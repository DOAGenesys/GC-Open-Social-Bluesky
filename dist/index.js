"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const inbound_1 = require("./jobs/inbound");
const social_listening_1 = require("./jobs/social-listening");
const webhook_1 = require("./middleware/webhook");
const logger_1 = require("./services/logger");
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
app.use(express_1.default.json());
app.use('/webhook', webhook_1.webhookRouter);
app.listen(port, () => {
    logger_1.logger.info(`Server is running on port ${port}`);
    (0, inbound_1.startInboundPolling)();
    (0, social_listening_1.startSocialListening)();
});
