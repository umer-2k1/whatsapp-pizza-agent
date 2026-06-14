import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { processMessage } from "../services/conversationService.js";
import { sanitizePhone } from "../utils/sanitize.js";
import { markMessageAsRead, sendTextMessage } from "./client.js";

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

interface WhatsAppTextMessage {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
}

function extractTextMessages(body: unknown): WhatsAppTextMessage[] {
  const messages: WhatsAppTextMessage[] = [];
  const payload = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: WhatsAppTextMessage[];
        };
      }>;
    }>;
  };

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (message.type === "text" && message.text?.body) {
          messages.push(message);
        }
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

  const messages = extractTextMessages(req.body);

  for (const message of messages) {
    if (!rememberMessageId(message.id)) {
      continue;
    }

    const phone = sanitizePhone(message.from);
    const text = message.text!.body;

    void (async () => {
      try {
        await markMessageAsRead(message.id);
        const reply = await processMessage(phone, text);
        await sendTextMessage(phone, reply);
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
