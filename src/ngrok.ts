import { env } from "./config/env.js";
import { setWebhookUrl } from "./webhookUrl.js";

const NGROK_API = env.NGROK_API_URL;

function normalizeWebhookUrl(url: string): string {
  const trimmed = url.replace(/\/$/, "");
  return trimmed.endsWith("/webhook") ? trimmed : `${trimmed}/webhook`;
}

interface NgrokTunnel {
  public_url: string;
  proto: string;
  config?: { addr?: string };
}

function tunnelMatchesPort(tunnel: NgrokTunnel, port: number): boolean {
  const addr = tunnel.config?.addr ?? "";
  return addr.includes(`:${port}`) || addr.endsWith(String(port));
}

async function fetchNgrokUrl(port: number): Promise<string | null> {
  try {
    const response = await fetch(`${NGROK_API}/api/tunnels`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { tunnels?: NgrokTunnel[] };
    const tunnels = data.tunnels ?? [];

    const httpsForPort = tunnels.find(
      (t) => t.proto === "https" && tunnelMatchesPort(t, port)
    );
    if (httpsForPort?.public_url) {
      return normalizeWebhookUrl(httpsForPort.public_url);
    }

    const anyHttps = tunnels.find((t) => t.proto === "https");
    if (anyHttps?.public_url) {
      return normalizeWebhookUrl(anyHttps.public_url);
    }

    return null;
  } catch {
    return null;
  }
}

export async function resolveWebhookUrl(port: number): Promise<string> {
  if (env.WEBHOOK_URL) {
    return normalizeWebhookUrl(env.WEBHOOK_URL);
  }

  for (let attempt = 0; attempt < 15; attempt++) {
    const ngrokUrl = await fetchNgrokUrl(port);
    if (ngrokUrl) {
      return ngrokUrl;
    }

    if (attempt === 0) {
      console.log("Looking for ngrok tunnel... (run in another terminal: ngrok http 3000)");
    } else if (attempt < 14) {
      console.log(`Waiting for ngrok... (${attempt + 1}/15)`);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.warn(
    "⚠ ngrok not found. Start it in another terminal:\n  ngrok http 3000\nThen restart the server or check GET /health"
  );
  return `http://localhost:${port}/webhook`;
}

export async function refreshWebhookUrl(port: number): Promise<string> {
  if (env.WEBHOOK_URL) {
    const url = normalizeWebhookUrl(env.WEBHOOK_URL);
    setWebhookUrl(url);
    return url;
  }

  const ngrokUrl = await fetchNgrokUrl(port);
  if (ngrokUrl) {
    setWebhookUrl(ngrokUrl);
    return ngrokUrl;
  }

  const fallback = `http://localhost:${port}/webhook`;
  setWebhookUrl(fallback);
  return fallback;
}
