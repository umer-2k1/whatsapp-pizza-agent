import { chatWithGroq } from "../ai/groq.js";
import { isValidMenuItem, resolveMenuSelection } from "../config/menu.js";
import {
  createOrder,
  formatOrderConfirmation,
  formatOrderDetails,
  getMissingField,
  getMissingFieldPrompt,
  getOrder,
  OrderValidationError,
} from "./orderService.js";
import {
  addChatMessage,
  clearPendingOrder,
  getChatHistory,
  getPendingOrder,
  setPendingOrder,
} from "./sessionStore.js";
import type { PendingOrder } from "../types/order.js";
import type { BotReply } from "../types/reply.js";
import { menuListReply, textReply } from "../types/reply.js";
import { sanitizeInput } from "../utils/sanitize.js";

const ORDER_ID_PATTERN = /\bPZ\d{6}\b/i;

const MENU_TRIGGERS = [
  "menu",
  "show menu",
  "view menu",
  "what's on the menu",
  "whats on the menu",
  "see menu",
  "pizza menu",
];

const GREETING_TRIGGERS = ["hi", "hello", "hey", "salam", "assalam"];

function extractOrderId(text: string): string | undefined {
  const match = text.match(ORDER_ID_PATTERN);
  return match ? match[0].toUpperCase() : undefined;
}

function looksLikeTrackingRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    extractOrderId(text) !== undefined ||
    lower.includes("where is my order") ||
    lower.includes("track my order") ||
    lower.includes("order status") ||
    lower.includes("track order")
  );
}

export function looksLikeMenuRequest(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return MENU_TRIGGERS.some(
    (trigger) => lower === trigger || lower.includes(trigger)
  );
}

function looksLikeGreeting(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return GREETING_TRIGGERS.some(
    (g) => lower === g || lower.startsWith(`${g} `) || lower.startsWith(`${g}!`)
  );
}

function normalizeUserMessage(rawMessage: string): string {
  const sanitized = sanitizeInput(rawMessage);
  if (!sanitized) return "";

  const menuSelection = resolveMenuSelection(sanitized);
  return menuSelection ?? sanitized;
}

function mergePendingField(
  pending: PendingOrder,
  message: string
): PendingOrder {
  const updated = { ...pending, updatedAt: Date.now() };

  switch (pending.awaiting) {
    case "name":
      updated.customerName = message;
      break;
    case "address":
      updated.address = message;
      break;
    case "item": {
      const name = resolveMenuSelection(message) ?? message.trim();
      if (isValidMenuItem(name)) {
        updated.items = [{ name, quantity: 1 }];
      }
      break;
    }
  }

  return updated;
}

function nextAwaitingField(pending: PendingOrder): PendingOrder["awaiting"] {
  return getMissingField(
    pending.items,
    pending.customerName,
    pending.address
  );
}

function itemSelectionReply(): BotReply {
  return menuListReply("Tap View Menu and pick a pizza:", {
    header: "🍕 Pizza Menu",
    footer: "All prices in PKR",
  });
}

function attemptCreateFromPending(phone: string, pending: PendingOrder): BotReply {
  try {
    const order = createOrder({
      phone,
      customerName: pending.customerName!,
      address: pending.address!,
      items: pending.items,
    });
    clearPendingOrder(phone);
    return textReply(formatOrderConfirmation(order));
  } catch (error) {
    if (error instanceof OrderValidationError) {
      const field = getMissingField(
        pending.items,
        pending.customerName,
        pending.address
      );
      if (field) {
        setPendingOrder(phone, { ...pending, awaiting: field });
        if (field === "item") return itemSelectionReply();
        return textReply(getMissingFieldPrompt(field));
      }
      return textReply(error.message);
    }
    throw error;
  }
}

function handlePendingSession(phone: string, message: string): BotReply | null {
  const pending = getPendingOrder(phone);
  if (!pending || !pending.awaiting) return null;

  const updated = mergePendingField(pending, message);

  if (pending.awaiting === "item" && updated.items.length === 0) {
    setPendingOrder(phone, { ...updated, awaiting: "item" });
    return itemSelectionReply();
  }

  const awaiting = nextAwaitingField(updated);
  if (awaiting) {
    setPendingOrder(phone, { ...updated, awaiting });
    if (awaiting === "item") return itemSelectionReply();
    return textReply(getMissingFieldPrompt(awaiting));
  }

  return attemptCreateFromPending(phone, updated);
}

function recordExchange(phone: string, userMessage: string, reply: BotReply): void {
  addChatMessage(phone, { role: "user", content: userMessage });
  const assistantContent =
    reply.kind === "text" ? reply.text : `[menu list] ${reply.body}`;
  addChatMessage(phone, { role: "assistant", content: assistantContent });
}

export async function processMessage(
  phone: string,
  rawMessage: string
): Promise<BotReply> {
  const message = normalizeUserMessage(rawMessage);
  if (!message) {
    return textReply("I didn't catch that. What would you like to order? 🍕");
  }

  if (looksLikeTrackingRequest(message)) {
    const orderId = extractOrderId(message);
    const order = getOrder({ orderId, phone });
    const reply = textReply(
      order ? formatOrderDetails(order) : "No record found for that order."
    );
    recordExchange(phone, message, reply);
    return reply;
  }

  if (looksLikeMenuRequest(message)) {
    const reply = itemSelectionReply();
    recordExchange(phone, message, reply);
    return reply;
  }

  const pendingReply = handlePendingSession(phone, message);
  if (pendingReply) {
    recordExchange(phone, message, pendingReply);
    return pendingReply;
  }

  if (looksLikeGreeting(message)) {
    const reply = itemSelectionReply();
    recordExchange(phone, message, reply);
    return reply;
  }

  const history = getChatHistory(phone);
  const { reply, orderCreated } = await chatWithGroq(phone, message, history);

  if (orderCreated) {
    clearPendingOrder(phone);
  }

  const botReply = textReply(reply);
  recordExchange(phone, message, botReply);
  return botReply;
}
