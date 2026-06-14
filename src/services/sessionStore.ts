import type { ChatMessage, PendingOrder } from "../types/order.js";

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_HISTORY = 6;

const pendingOrders = new Map<string, PendingOrder>();
const chatHistory = new Map<string, ChatMessage[]>();

function isExpired(pending: PendingOrder): boolean {
  return Date.now() - pending.updatedAt > SESSION_TTL_MS;
}

export function getPendingOrder(phone: string): PendingOrder | null {
  const pending = pendingOrders.get(phone);
  if (!pending) return null;
  if (isExpired(pending)) {
    pendingOrders.delete(phone);
    return null;
  }
  return pending;
}

export function setPendingOrder(phone: string, pending: PendingOrder): void {
  pendingOrders.set(phone, { ...pending, updatedAt: Date.now() });
}

export function clearPendingOrder(phone: string): void {
  pendingOrders.delete(phone);
}

export function getChatHistory(phone: string): ChatMessage[] {
  return chatHistory.get(phone) ?? [];
}

export function addChatMessage(phone: string, message: ChatMessage): void {
  const history = chatHistory.get(phone) ?? [];
  history.push(message);
  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }
  chatHistory.set(phone, history);
}

export function clearChatHistory(phone: string): void {
  chatHistory.delete(phone);
}
