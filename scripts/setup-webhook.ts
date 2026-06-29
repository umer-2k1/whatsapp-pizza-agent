import dotenv from "dotenv";
import { resolveWebhookUrl } from "../src/ngrok.js";

dotenv.config();

const APP_ID = process.env.WHATSAPP_APP_ID ?? "1042153305136627";
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const PORT = Number(process.env.PORT ?? 3000);
const GRAPH_API = "https://graph.facebook.com/v25.0";

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

async function resolveWabaId(appAccessToken: string): Promise<string> {
  if (!ACCESS_TOKEN) {
    throw new Error("Missing WHATSAPP_ACCESS_TOKEN in .env (needed to find WABA ID)");
  }

  const res = await fetch(
    `${GRAPH_API}/debug_token?input_token=${encodeURIComponent(ACCESS_TOKEN)}&access_token=${appAccessToken}`
  );
  const data = (await res.json()) as {
    data?: { granular_scopes?: Array<{ scope: string; target_ids?: string[] }> };
    error?: { message: string };
  };

  if (!res.ok) {
    throw new Error(data.error?.message ?? "Failed to resolve WABA ID from access token");
  }

  const wabaScope = data.data?.granular_scopes?.find((s) =>
    s.scope.startsWith("whatsapp_business_")
  );
  const wabaId = wabaScope?.target_ids?.[0];
  if (!wabaId) {
    throw new Error("Could not find WABA ID in token scopes");
  }

  return wabaId;
}

async function subscribeAppToWaba(wabaId: string): Promise<void> {
  if (!ACCESS_TOKEN) {
    throw new Error("Missing WHATSAPP_ACCESS_TOKEN in .env");
  }

  console.log("Subscribing app to WhatsApp Business Account...");
  console.log("  WABA ID:", wabaId);
  console.log("  App ID:", APP_ID);

  const check = await fetch(`${GRAPH_API}/${wabaId}/subscribed_apps`, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  const before = (await check.json()) as {
    data?: Array<{ whatsapp_business_api_data?: { id: string; name: string } }>;
  };
  const alreadySubscribed = before.data?.some(
    (entry) => entry.whatsapp_business_api_data?.id === APP_ID
  );

  if (alreadySubscribed) {
    console.log("  Already subscribed to WABA ✓\n");
    return;
  }

  const res = await fetch(`${GRAPH_API}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  });
  const body = await res.text();
  console.log("  WABA subscribe response:", res.status, body);

  if (!res.ok) {
    console.error("\nFailed to subscribe app to WABA — incoming messages will NOT reach your webhook.");
    process.exit(1);
  }

  console.log("  App subscribed to WABA ✓\n");
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
    `${GRAPH_API}/${APP_ID}/subscriptions`,
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

  const wabaId = await resolveWabaId(appAccessToken);
  await subscribeAppToWaba(wabaId);

  const check = await fetch(
    `${GRAPH_API}/${APP_ID}/subscriptions?access_token=${appAccessToken}`
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
