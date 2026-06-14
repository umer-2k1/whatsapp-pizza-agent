import dotenv from "dotenv";
import { resolveWebhookUrl } from "../src/ngrok.js";

dotenv.config();

const APP_ID = process.env.WHATSAPP_APP_ID ?? "1042153305136627";
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const PORT = Number(process.env.PORT ?? 3000);

async function checkUrl(url: string, label: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    console.log(`  ${label}: ${res.status} OK`);
    return res.ok;
  } catch (error) {
    console.error(`  ${label}: FAILED (${error instanceof Error ? error.message : error})`);
    return false;
  }
}

async function preflight(webhookUrl: string): Promise<void> {
  if (!webhookUrl.startsWith("https://")) {
    console.error(`
Webhook URL must be HTTPS. Got: ${webhookUrl}

Start ngrok in another terminal first:
  ngrok http ${PORT}

Then start the server:
  pnpm dev

Or set WEBHOOK_URL in .env to your ngrok HTTPS URL.
`);
    process.exit(1);
  }

  console.log("Pre-flight checks...");

  const localOk = await checkUrl(`http://localhost:${PORT}/health`, "Local server");
  const ngrokBase = webhookUrl.replace(/\/webhook\/?$/, "");
  const ngrokOk = await checkUrl(`${ngrokBase}/health`, "ngrok tunnel");

  const verifyUrl =
    `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN!)}&hub.challenge=preflight_ok`;
  let verifyOk = false;
  try {
    const res = await fetch(verifyUrl, { signal: AbortSignal.timeout(5000) });
    const body = await res.text();
    verifyOk = res.ok && body === "preflight_ok";
    console.log(`  Webhook verify via ngrok: ${verifyOk ? "OK" : `FAILED (${res.status})`}`);
  } catch (error) {
    console.error(`  Webhook verify via ngrok: FAILED (${error instanceof Error ? error.message : error})`);
  }

  if (!localOk || !ngrokOk || !verifyOk) {
    console.error(`
Pre-flight failed. Meta will get 502 Bad Gateway if the server is not running.

Run these in separate terminals BEFORE pnpm setup:webhook:

  Terminal 1:  ngrok http ${PORT}
  Terminal 2:  pnpm dev
  Terminal 3:  pnpm setup:webhook
`);
    process.exit(1);
  }

  console.log("Pre-flight passed.\n");
}

async function main(): Promise<void> {
  if (!APP_SECRET) {
    console.error(`
Missing WHATSAPP_APP_SECRET in .env

Get it from Meta Developer Dashboard:
  App → App settings → Basic → App secret → Show

Then add to .env:
  WHATSAPP_APP_ID=${APP_ID}
  WHATSAPP_APP_SECRET=your_app_secret_here
`);
    process.exit(1);
  }

  if (!VERIFY_TOKEN) {
    console.error("Missing WHATSAPP_VERIFY_TOKEN in .env");
    process.exit(1);
  }

  const webhookUrl = process.env.WEBHOOK_URL ?? (await resolveWebhookUrl(PORT));
  await preflight(webhookUrl);

  const appAccessToken = `${APP_ID}|${APP_SECRET}`;

  console.log("Registering webhook with Meta...");
  console.log("  App ID:", APP_ID);
  console.log("  Callback URL:", webhookUrl);

  const params = new URLSearchParams({
    object: "whatsapp_business_account",
    callback_url: webhookUrl,
    verify_token: VERIFY_TOKEN,
    fields: "messages",
    include_values: "true",
    access_token: appAccessToken,
  });

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${APP_ID}/subscriptions`,
    { method: "POST", body: params }
  );

  const body = await res.text();
  console.log("Subscribe response:", res.status, body);

  if (!res.ok) {
    if (body.includes("502")) {
      console.error("\nMeta got 502 — ensure pnpm dev is running while you run this command.");
    }
    process.exit(1);
  }

  const check = await fetch(
    `https://graph.facebook.com/v21.0/${APP_ID}/subscriptions?access_token=${appAccessToken}`
  );
  console.log("\nCurrent subscriptions:");
  console.log(JSON.stringify(await check.json(), null, 2));

  console.log(`
Done! Keep ngrok + pnpm dev running.
Send a WhatsApp message from +923153271442 to +1 555-646-8159
Watch terminal for: [webhook] POST received
`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
