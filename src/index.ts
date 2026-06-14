import { env } from "./config/env.js";
import { validateGroqKey } from "./ai/validateGroq.js";
import { getDb } from "./db/connection.js";
import { resolveWebhookUrl } from "./ngrok.js";
import { createApp } from "./server.js";
import { setWebhookUrl } from "./webhookUrl.js";

async function main(): Promise<void> {
  getDb();

  const app = createApp();
  const webhookUrl = await resolveWebhookUrl(env.PORT);
  setWebhookUrl(webhookUrl);
  await validateGroqKey();

  app.listen(env.PORT, () => {
    console.log(`WhatsApp Pizza Agent running on port ${env.PORT}`);
    console.log(`Webhook URL (register in Meta): ${webhookUrl}`);
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
