import express from "express";
import { env } from "./config/env.js";
import { refreshWebhookUrl } from "./ngrok.js";
import { handleWebhook, verifyWebhook } from "./whatsapp/webhook.js";

export function createApp(): express.Application {
  const app = express();

  app.use(express.json());

  app.get("/health", async (_req, res) => {
    const webhookUrl = await refreshWebhookUrl(env.PORT);
    res.json({
      status: "ok",
      webhookUrl,
      hint: "Register webhookUrl in Meta → WhatsApp → Configuration. messages field must be Subscribed.",
    });
  });

  app.get("/webhook", verifyWebhook);
  app.post("/webhook", handleWebhook);

  return app;
}
