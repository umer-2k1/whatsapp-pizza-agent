import dotenv from "dotenv";

dotenv.config();

const APP_ID = process.env.WHATSAPP_APP_ID ?? "";
const APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? "";
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN ?? "";
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
const PORT = Number(process.env.PORT ?? 3000);
const appToken = `${APP_ID}|${APP_SECRET}`;

async function getNgrokUrl(): Promise<string | null> {
  try {
    const res = await fetch("http://127.0.0.1:4040/api/tunnels");
    const data = (await res.json()) as {
      tunnels?: Array<{ public_url: string; proto: string }>;
    };
    const https = data.tunnels?.find((t) => t.proto === "https");
    if (!https) return null;
    const base = https.public_url.replace(/\/$/, "");
    return base.endsWith("/webhook") ? base : `${base}/webhook`;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  console.log("=== WhatsApp Webhook Diagnostic ===\n");

  const webhookUrl = process.env.WEBHOOK_URL ?? (await getNgrokUrl());
  console.log("1. Webhook URL:", webhookUrl ?? "NOT FOUND (start ngrok)");
  console.log("2. Verify token in .env:", VERIFY_TOKEN || "MISSING");

  try {
    const health = await fetch(`http://localhost:${PORT}/health`);
    console.log("3. Local server:", health.ok ? "OK" : `FAILED (${health.status})`);
  } catch {
    console.log("3. Local server: NOT RUNNING (pnpm dev)");
  }

  if (webhookUrl?.startsWith("https://")) {
    try {
      const base = webhookUrl.replace(/\/webhook\/?$/, "");
      const ngrokHealth = await fetch(`${base}/health`);
      console.log("4. ngrok tunnel:", ngrokHealth.ok ? "OK" : `FAILED (${ngrokHealth.status})`);
    } catch {
      console.log("4. ngrok tunnel: UNREACHABLE");
    }
  }

  const subsRes = await fetch(
    `https://graph.facebook.com/v25.0/${APP_ID}/subscriptions?access_token=${appToken}`
  );
  const subs = (await subsRes.json()) as {
    data?: Array<{
      callback_url?: string;
      active?: boolean;
      fields?: Array<{ name: string }>;
    }>;
  };
  console.log("\n5. App-level webhook subscription:");
  const wa = subs.data?.find((s) => s.callback_url?.includes("webhook"));
  if (wa) {
    console.log("   Callback URL:", wa.callback_url);
    console.log("   Active:", wa.active);
    const fields = wa.fields?.map((f) => f.name) ?? [];
    console.log("   Fields:", fields.join(", "));
    console.log(
      "   messages subscribed:",
      fields.includes("messages") ? "YES ✓" : "NO ✗ — THIS IS THE PROBLEM"
    );
    if (wa.callback_url !== webhookUrl) {
      console.log("\n   ⚠ URL MISMATCH!");
      console.log("   Meta has:", wa.callback_url);
      console.log("   ngrok has:", webhookUrl);
      console.log("   → Run: pnpm setup:webhook");
    }
  } else {
    console.log("   NOT CONFIGURED → Run: pnpm setup:webhook");
  }

  const phoneRes = await fetch(
    `https://graph.facebook.com/v25.0/${PHONE_ID}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${ACCESS_TOKEN}` } }
  );
  const phone = await phoneRes.json();
  console.log("\n6. WhatsApp test number:", phone.display_phone_number ?? phone);

  console.log(`
=== CRITICAL: Meta Configuration (manual step) ===

App subscriptions alone may NOT deliver message POSTs.
You MUST also configure in Meta Developer Dashboard:

  1. Go to: developers.facebook.com → Your App → WhatsApp → Configuration
  2. Webhook → Edit
  3. Callback URL: ${webhookUrl ?? "https://YOUR-NGROK-URL.ngrok-free.dev/webhook"}
  4. Verify token: ${VERIFY_TOKEN}
  5. Click "Verify and Save"
  6. Under Webhook fields → toggle "messages" to SUBSCRIBED (green)

=== How to verify it works ===

  1. Open http://127.0.0.1:4040 (ngrok inspect)
  2. Send WhatsApp message to ${phone.display_phone_number ?? "+1 555-646-8159"}
  3. You MUST see: POST /webhook from Meta IP (2a03:2880:...)
  4. If you only see GET /webhook (verify) but NO POST → messages not subscribed

=== ngrok history check ===
`);
  try {
    const ngrokReqs = await fetch("http://127.0.0.1:4040/api/requests/http");
    const data = (await ngrokReqs.json()) as {
      requests?: Array<{
        request?: { method?: string; uri?: string };
        remote_addr?: string;
      }>;
    };
    const posts = (data.requests ?? []).filter(
      (r) => r.request?.method === "POST" && r.request?.uri === "/webhook"
    );
    const metaPosts = posts.filter((r) => r.remote_addr?.startsWith("2a03:"));
    console.log(`   POST /webhook total: ${posts.length}`);
    console.log(`   POST /webhook from Meta: ${metaPosts.length}`);
    if (metaPosts.length === 0) {
      console.log("   ✗ Meta has NEVER sent message webhooks to your server");
      console.log("   → Fix Configuration → subscribe to 'messages' field");
    }
  } catch {
    console.log("   (ngrok inspect not available)");
  }
}

main().catch(console.error);
