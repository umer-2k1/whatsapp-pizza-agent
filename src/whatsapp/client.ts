import { env } from "../config/env.js";

const WHATSAPP_API_URL = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

export async function sendTextMessage(to: string, text: string): Promise<void> {
  const response = await fetch(WHATSAPP_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WhatsApp API error ${response.status}: ${body}`);
  }
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
