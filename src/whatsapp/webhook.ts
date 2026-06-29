import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { resolveMenuSelection } from "../config/menu.js";
import { processMessage } from "../services/conversationService.js";
import { sanitizePhone } from "../utils/sanitize.js";
import { markMessageAsRead, sendBotReply, sendTextMessage } from "./client.js";

const processedMessageIds = new Set<string>();
const MAX_PROCESSED_IDS = 1000;

function rememberMessageId(id: string): boolean {
  if (processedMessageIds.has(id)) {
    return false;
  }
  processedMessageIds.add(id);
  if (processedMessageIds.size > MAX_PROCESSED_IDS) {
    const first = processedMessageIds.values().next().value;
    if (first) processedMessageIds.delete(first);
  }
  return true;
}

interface IncomingMessage {
  id: string;
  from: string;
  text: string;
}

interface WhatsAppMessage {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  interactive?: {
    type: string;
    list_reply?: { id: string; title: string };
    button_reply?: { id: string; title: string };
  };
  button?: { text: string; payload: string };
}

function extractMessageText(message: WhatsAppMessage): string | null {
  if (message.type === "text" && message.text?.body) {
    return message.text.body;
  }

  if (message.type === "interactive" && message.interactive) {
    const { interactive } = message;
    if (interactive.type === "list_reply" && interactive.list_reply) {
      return interactive.list_reply.id;
    }
    if (interactive.type === "button_reply" && interactive.button_reply) {
      return interactive.button_reply.id;
    }
  }

  if (message.type === "button" && message.button) {
    return message.button.payload || message.button.text;
  }

  return null;
}

function extractIncomingMessages(body: unknown): IncomingMessage[] {
  const messages: IncomingMessage[] = [];
  const payload = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: WhatsAppMessage[];
        };
      }>;
    }>;
  };

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        const rawText = extractMessageText(message);
        if (!rawText) continue;

        const resolved = resolveMenuSelection(rawText) ?? rawText;
        messages.push({
          id: message.id,
          from: message.from,
          text: resolved,
        });
      }
    }
  }

  return messages;
}

export function verifyWebhook(req: Request, res: Response): void {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
    return;
  }

  res.sendStatus(403);
}

export function handleWebhook(req: Request, res: Response): void {
  res.sendStatus(200);

  const body = req.body as { object?: string; entry?: unknown[] };
  console.log("[webhook] POST received", {
    object: body?.object,
    entries: body?.entry?.length ?? 0,
  });

  const messages = extractIncomingMessages(req.body);

  if (messages.length === 0) {
    console.log("[webhook] No text messages in payload (status update or unsupported type)");
    return;
  }

  for (const message of messages) {
    if (!rememberMessageId(message.id)) {
      console.log("[webhook] Duplicate message skipped:", message.id);
      continue;
    }

    const phone = sanitizePhone(message.from);
    const text = message.text;
    console.log(`[webhook] Message from ${phone}: ${text}`);

    void (async () => {
      try {
        await markMessageAsRead(message.id);
        const reply = await processMessage(phone, text);
        await sendBotReply(phone, reply);
        console.log(`[webhook] Reply sent to ${phone} (${reply.kind})`);
      } catch (error) {
        console.error("Failed to process message:", error);
        try {
          await sendTextMessage(
            phone,
            "Sorry, something went wrong. Please try again in a moment. 🍕"
          );
        } catch (sendError) {
          console.error("Failed to send error reply:", sendError);
        }
      }
    })();
  }
}
