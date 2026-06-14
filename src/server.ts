import express from "express";
import { handleWebhook, verifyWebhook } from "./whatsapp/webhook.js";

export function createApp(): express.Application {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/webhook", verifyWebhook);
  app.post("/webhook", handleWebhook);

  return app;
}
