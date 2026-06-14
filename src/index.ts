import { env } from "./config/env.js";
import { getDb } from "./db/connection.js";
import { createApp } from "./server.js";

getDb();

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`WhatsApp Pizza Agent running on port ${env.PORT}`);
  console.log(`Webhook URL: http://localhost:${env.PORT}/webhook`);
});
