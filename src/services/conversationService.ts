import { chatWithGroq } from "../ai/groq.js";
import { isValidMenuItem } from "../config/menu.js";
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
import { sanitizeInput } from "../utils/sanitize.js";

const ORDER_ID_PATTERN = /\bPZ\d{6}\b/i;

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
      const name = message.trim();
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

function attemptCreateFromPending(phone: string, pending: PendingOrder): string {
  try {
    const order = createOrder({
      phone,
      customerName: pending.customerName!,
      address: pending.address!,
      items: pending.items,
    });
    clearPendingOrder(phone);
    return formatOrderConfirmation(order);
  } catch (error) {
    if (error instanceof OrderValidationError) {
      const field = getMissingField(
        pending.items,
        pending.customerName,
        pending.address
      );
      if (field) {
        setPendingOrder(phone, { ...pending, awaiting: field });
        return getMissingFieldPrompt(field);
      }
      return error.message;
    }
    throw error;
  }
}

function handlePendingSession(phone: string, message: string): string | null {
  const pending = getPendingOrder(phone);
  if (!pending || !pending.awaiting) return null;

  const updated = mergePendingField(pending, message);

  if (pending.awaiting === "item" && updated.items.length === 0) {
    setPendingOrder(phone, { ...updated, awaiting: "item" });
    return "We only serve pizzas from our menu 🍕";
  }

  const awaiting = nextAwaitingField(updated);
  if (awaiting) {
    setPendingOrder(phone, { ...updated, awaiting });
    return getMissingFieldPrompt(awaiting);
  }

  return attemptCreateFromPending(phone, updated);
}

export async function processMessage(
  phone: string,
  rawMessage: string
): Promise<string> {
  const message = sanitizeInput(rawMessage);
  if (!message) {
    return "I didn't catch that. What would you like to order? 🍕";
  }

  if (looksLikeTrackingRequest(message)) {
    const orderId = extractOrderId(message);
    const order = getOrder({ orderId, phone });
    addChatMessage(phone, { role: "user", content: message });

    const reply = order
      ? formatOrderDetails(order)
      : "No record found for that order.";

    addChatMessage(phone, { role: "assistant", content: reply });
    return reply;
  }

  const pendingReply = handlePendingSession(phone, message);
  if (pendingReply) {
    addChatMessage(phone, { role: "user", content: message });
    addChatMessage(phone, { role: "assistant", content: pendingReply });
    return pendingReply;
  }

  const history = getChatHistory(phone);
  const { reply, orderCreated } = await chatWithGroq(phone, message, history);

  if (orderCreated) {
    clearPendingOrder(phone);
  }

  addChatMessage(phone, { role: "user", content: message });
  addChatMessage(phone, { role: "assistant", content: reply });

  return reply;
}
