import { buildMenuListPayload } from "../config/menu.js";
import type { BotReply } from "../types/reply.js";
import { env } from "../config/env.js";

const WHATSAPP_API_URL = `https://graph.facebook.com/v25.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

async function postMessage(body: Record<string, unknown>): Promise<void> {
  const response = await fetch(WHATSAPP_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WhatsApp API error ${response.status}: ${text}`);
  }
}

export async function sendTextMessage(to: string, text: string): Promise<void> {
  await postMessage({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { preview_url: false, body: text },
  });
}

export async function sendInteractiveListMessage(
  to: string,
  payload: ReturnType<typeof buildMenuListPayload>
): Promise<void> {
  const interactive: Record<string, unknown> = {
    type: "list",
    body: { text: payload.body },
    action: {
      button: payload.buttonLabel,
      sections: [
        {
          title: "Pizzas",
          rows: payload.rows.map((row) => ({
            id: row.id,
            title: row.title,
            description: row.description,
          })),
        },
      ],
    },
  };

  if (payload.header) {
    interactive.header = { type: "text", text: payload.header };
  }
  if (payload.footer) {
    interactive.footer = { text: payload.footer };
  }

  await postMessage({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive,
  });
}

export async function sendBotReply(to: string, reply: BotReply): Promise<void> {
  if (reply.kind === "text") {
    await sendTextMessage(to, reply.text);
    return;
  }

  await sendInteractiveListMessage(to, buildMenuListPayload(reply));
}

export async function markMessageAsRead(messageId: string): Promise<void> {
  await fetch(WHATSAPP_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  }).catch(() => {
    // Non-critical; ignore read receipt failures
  });
}
