import { chatWithGroq } from "../ai/groq.js";
import {
  ADD_ANOTHER_ID,
  DONE_ORDER_ID,
  isValidMenuItem,
  parseActionButton,
  parseQuantityInput,
  quantityButtonId,
  resolveMenuSelection,
} from "../config/menu.js";
import {
  createOrder,
  formatCartSummary,
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
import type { OrderItemInput, PendingOrder } from "../types/order.js";
import type { BotReply } from "../types/reply.js";
import { buttonReply, menuListReply, textReply } from "../types/reply.js";
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

function emptyPending(overrides?: Partial<PendingOrder>): PendingOrder {
  return {
    items: [],
    awaiting: "item",
    updatedAt: Date.now(),
    ...overrides,
  };
}

function addItemToCart(
  items: OrderItemInput[],
  name: string,
  quantity: number
): OrderItemInput[] {
  const copy = items.map((item) => ({ ...item }));
  const index = copy.findIndex(
    (item) => item.name.toLowerCase() === name.toLowerCase()
  );

  if (index >= 0) {
    copy[index] = {
      ...copy[index],
      quantity: (copy[index].quantity ?? 1) + quantity,
    };
    return copy;
  }

  copy.push({ name, quantity });
  return copy;
}

function itemSelectionReply(): BotReply {
  return menuListReply("Tap View Menu and pick a pizza:", {
    header: "🍕 Pizza Menu",
    footer: "All prices in PKR",
  });
}

function quantityReply(pizzaName: string): BotReply {
  return buttonReply(
    `How many ${pizzaName} pizzas would you like?`,
    [
      { id: quantityButtonId(1), title: "1" },
      { id: quantityButtonId(2), title: "2" },
      { id: quantityButtonId(3), title: "3" },
    ],
    { footer: "Or type a number (e.g. 5)" }
  );
}

function addMoreReply(items: OrderItemInput[]): BotReply {
  return buttonReply(
    `${formatCartSummary(items)}\n\nAdd another pizza or finish ordering?`,
    [
      { id: ADD_ANOTHER_ID, title: "Add another" },
      { id: DONE_ORDER_ID, title: "Done ordering" },
    ],
    { header: "🛒 Your cart" }
  );
}

function resumeItemSelection(phone: string, pending: PendingOrder): BotReply {
  setPendingOrder(phone, {
    ...pending,
    awaiting: "item",
    selectedItem: undefined,
    updatedAt: Date.now(),
  });
  return itemSelectionReply();
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

  switch (pending.awaiting) {
    case "item": {
      const name = resolveMenuSelection(message) ?? message.trim();
      if (!isValidMenuItem(name)) {
        return resumeItemSelection(phone, pending);
      }

      setPendingOrder(phone, {
        ...pending,
        selectedItem: name,
        awaiting: "quantity",
        updatedAt: Date.now(),
      });
      return quantityReply(name);
    }

    case "quantity": {
      const qty = parseQuantityInput(message);
      const pizzaName = pending.selectedItem;

      if (!qty || !pizzaName) {
        return pizzaName
          ? quantityReply(pizzaName)
          : resumeItemSelection(phone, pending);
      }

      const items = addItemToCart(pending.items, pizzaName, qty);
      setPendingOrder(phone, {
        ...pending,
        items,
        selectedItem: undefined,
        awaiting: "add_more",
        updatedAt: Date.now(),
      });
      return addMoreReply(items);
    }

    case "add_more": {
      const action = parseActionButton(message);
      if (action === "add_another") {
        return resumeItemSelection(phone, { ...pending, items: pending.items });
      }

      const extraPizza = resolveMenuSelection(message) ?? message.trim();
      if (isValidMenuItem(extraPizza)) {
        setPendingOrder(phone, {
          ...pending,
          selectedItem: extraPizza,
          awaiting: "quantity",
          updatedAt: Date.now(),
        });
        return quantityReply(extraPizza);
      }

      if (action === "done_order") {
        if (pending.items.length === 0) {
          return resumeItemSelection(phone, pending);
        }

        const nextField = getMissingField(
          pending.items,
          pending.customerName,
          pending.address
        );

        if (!nextField) {
          return attemptCreateFromPending(phone, pending);
        }

        setPendingOrder(phone, {
          ...pending,
          awaiting: nextField,
          updatedAt: Date.now(),
        });

        if (nextField === "item") return itemSelectionReply();
        return textReply(getMissingFieldPrompt(nextField));
      }

      return addMoreReply(pending.items);
    }

    case "name": {
      const updated: PendingOrder = {
        ...pending,
        customerName: message,
        updatedAt: Date.now(),
      };
      const nextField = getMissingField(
        updated.items,
        updated.customerName,
        updated.address
      );

      if (!nextField) {
        return attemptCreateFromPending(phone, updated);
      }

      setPendingOrder(phone, { ...updated, awaiting: nextField });
      if (nextField === "item") return itemSelectionReply();
      return textReply(getMissingFieldPrompt(nextField));
    }

    case "address": {
      const updated: PendingOrder = {
        ...pending,
        address: message,
        updatedAt: Date.now(),
      };
      return attemptCreateFromPending(phone, updated);
    }

    default:
      return null;
  }
}

function recordExchange(phone: string, userMessage: string, reply: BotReply): void {
  addChatMessage(phone, { role: "user", content: userMessage });
  const assistantContent =
    reply.kind === "text"
      ? reply.text
      : reply.kind === "menu_list"
        ? `[menu list] ${reply.body}`
        : `[buttons] ${reply.body}`;
  addChatMessage(phone, { role: "assistant", content: assistantContent });
}

function startOrdering(phone: string): BotReply {
  const existing = getPendingOrder(phone);
  setPendingOrder(
    phone,
    emptyPending({
      items: existing?.items ?? [],
      customerName: existing?.customerName,
      address: existing?.address,
    })
  );
  return itemSelectionReply();
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
    const reply = startOrdering(phone);
    recordExchange(phone, message, reply);
    return reply;
  }

  const pendingReply = handlePendingSession(phone, message);
  if (pendingReply) {
    recordExchange(phone, message, pendingReply);
    return pendingReply;
  }

  const menuPick = resolveMenuSelection(message);
  if (menuPick && isValidMenuItem(menuPick)) {
    setPendingOrder(phone, {
      items: getPendingOrder(phone)?.items ?? [],
      selectedItem: menuPick,
      awaiting: "quantity",
      updatedAt: Date.now(),
    });
    const reply = quantityReply(menuPick);
    recordExchange(phone, message, reply);
    return reply;
  }

  if (looksLikeGreeting(message)) {
    const reply = startOrdering(phone);
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
