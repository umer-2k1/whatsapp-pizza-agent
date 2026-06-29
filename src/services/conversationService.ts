import { chatWithGroq } from "../ai/groq.js";
import {
  ADD_ANOTHER_ID,
  DONE_ORDER_ID,
  isValidMenuItem,
  parseActionButton,
  parseQuantityInput,
  quantityButtonId,
  resolveMenuSelection,
  SHOW_MENU_ID,
} from "../config/menu.js";
import { SHOP_NAME } from "../config/shop.js";
import {
  classifyIntent,
  extractPizzaNamesFromMessage,
  isAcceptingMenuOffer,
  isCartAction,
  wasMenuOfferedRecently,
  type Intent,
} from "./intentService.js";
import {
  createOrder,
  formatCartSummary,
  formatDeliveryEta,
  formatNoOrderFound,
  formatOrderIntro,
  formatOrderReceipt,
  formatOrderDetails,
  getMissingField,
  getMissingFieldPrompt,
  getOrder,
  isConfirmingPrefill,
  OrderValidationError,
} from "./orderService.js";
import {
  addChatMessage,
  clearPendingOrder,
  getChatHistory,
  getPendingOrder,
  setPendingOrder,
} from "./sessionStore.js";
import type { OrderItemInput, PendingOrder, ChatMessage } from "../types/order.js";
import type { BotReply, ProcessResult } from "../types/reply.js";
import { buttonReply, menuListReply, textReply } from "../types/reply.js";
import { sanitizeInput } from "../utils/sanitize.js";

const ORDER_ID_PATTERN = /\bPZ\d{6}\b/i;

function extractOrderId(text: string): string | undefined {
  const match = text.match(ORDER_ID_PATTERN);
  return match ? match[0].toUpperCase() : undefined;
}

function normalizeUserMessage(rawMessage: string): string {
  const sanitized = sanitizeInput(rawMessage);
  if (!sanitized) return "";
  return sanitized;
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
  return menuListReply("Sure thing! 👇 Tap *View Menu* to pick your pizza:", {
    header: `🍕 ${SHOP_NAME}`,
    footer: "All prices in PKR",
  });
}

function quantityReply(pizzaName: string): BotReply {
  return buttonReply(
    `Nice choice! 🍕 How many *${pizzaName}* pizzas?`,
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
    `${formatCartSummary(items)}\n\nAdd another or finish up? 👇`,
    [
      { id: ADD_ANOTHER_ID, title: "Add another" },
      { id: DONE_ORDER_ID, title: "Done ordering" },
    ],
    { header: "🛒 Your cart" }
  );
}

function menuOfferButton(): BotReply {
  return buttonReply("Want to see the full menu? 🍕", [
    { id: SHOW_MENU_ID, title: "View Menu" },
  ]);
}

function shouldShowMenu(
  message: string,
  intent: Intent,
  history: ChatMessage[]
): boolean {
  if (intent === "show_menu" || intent === "menu_request") return true;

  if (!isAcceptingMenuOffer(message)) return false;

  if (wasMenuOfferedRecently(history)) return true;

  const lastUser = [...history].reverse().find((m) => m.role === "user");
  if (lastUser && classifyIntent(lastUser.content) === "recommendation") {
    return true;
  }

  return false;
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

function startNaturalOrder(phone: string, pizzaNames: string[]): ProcessResult {
  const existing = getPendingOrder(phone);
  const previousOrder = getOrder({ phone });

  setPendingOrder(phone, {
    items: [],
    awaiting: "quantity",
    selectedItem: pizzaNames[0],
    naturalOrderQueue: pizzaNames.slice(1),
    customerName: previousOrder?.customer_name ?? existing?.customerName,
    address: previousOrder?.address ?? existing?.address,
    updatedAt: Date.now(),
  });

  const replies: BotReply[] = [
    textReply(`Got it! 👍 Let's get those for you.`),
    quantityReply(pizzaNames[0]!),
  ];

  return replies;
}

function orderConfirmationReplies(order: Parameters<typeof formatOrderReceipt>[0]): ProcessResult {
  return [
    textReply(formatOrderIntro(order)),
    textReply(formatOrderReceipt(order)),
  ];
}

function attemptCreateFromPending(phone: string, pending: PendingOrder): ProcessResult {
  try {
    const order = createOrder({
      phone,
      customerName: pending.customerName!,
      address: pending.address!,
      items: pending.items,
    });
    clearPendingOrder(phone);
    return orderConfirmationReplies(order);
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

function handlePendingSession(phone: string, message: string): ProcessResult | null {
  const pending = getPendingOrder(phone);
  if (!pending?.awaiting) return null;

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

      const queue = pending.naturalOrderQueue ?? [];
      if (queue.length > 0) {
        const nextPizza = queue[0];
        setPendingOrder(phone, {
          ...pending,
          items,
          selectedItem: nextPizza,
          naturalOrderQueue: queue.slice(1),
          awaiting: "quantity",
          updatedAt: Date.now(),
        });
        return quantityReply(nextPizza!);
      }

      setPendingOrder(phone, {
        ...pending,
        items,
        selectedItem: undefined,
        naturalOrderQueue: undefined,
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

        if (nextField === "name" && pending.customerName) {
          return textReply(
            `Perfect! Order for *${pending.customerName}* like last time? 😊 (or type a new name)`
          );
        }

        if (nextField === "address" && pending.address) {
          return textReply(
            `Great! Deliver to *${pending.address}* like last time? 📍 (or type a new address)`
          );
        }

        return textReply(getMissingFieldPrompt(nextField));
      }

      return addMoreReply(pending.items);
    }

    case "name": {
      const confirming = isConfirmingPrefill(message);
      const finalName = confirming && pending.customerName ? pending.customerName : message;

      const updated: PendingOrder = {
        ...pending,
        customerName: finalName,
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

      if (nextField === "address" && pending.address) {
        return textReply(
          `Great! Deliver to *${pending.address}* like last time? 📍 (or type a new address)`
        );
      }

      return textReply(getMissingFieldPrompt(nextField));
    }

    case "address": {
      const confirming = isConfirmingPrefill(message);
      const finalAddress = confirming && pending.address ? pending.address : message;

      const updated: PendingOrder = {
        ...pending,
        address: finalAddress,
        updatedAt: Date.now(),
      };
      return attemptCreateFromPending(phone, updated);
    }

    default:
      return null;
  }
}

function handleOrderLookup(
  phone: string,
  message: string,
  intent: Intent
): ProcessResult {
  const orderId = extractOrderId(message);
  const order = getOrder({ orderId, phone });

  if (!order) {
    return textReply(formatNoOrderFound());
  }

  if (intent === "delivery_eta") {
    return textReply(formatDeliveryEta(order));
  }

  return [
    textReply(`Here's your order details 👇`),
    textReply(formatOrderDetails(order)),
  ];
}

function recordExchange(phone: string, userMessage: string, result: ProcessResult): void {
  addChatMessage(phone, { role: "user", content: userMessage });

  const replies = Array.isArray(result) ? result : [result];
  const assistantContent = replies
    .map((reply) => {
      if (reply.kind === "text") return reply.text;
      if (reply.kind === "menu_list") return `[menu list] ${reply.body}`;
      return `[buttons] ${reply.body}`;
    })
    .join("\n");

  addChatMessage(phone, { role: "assistant", content: assistantContent });
}

async function handleGroqIntent(
  phone: string,
  message: string,
  intent: Intent
): Promise<ProcessResult> {
  const history = getChatHistory(phone);
  const intentHint =
    intent === "greeting"
      ? "greeting — welcome them to the shop warmly, do NOT send a menu"
      : intent === "recommendation"
        ? "recommendation — share hot sellers conversationally, offer menu with [OFFER_MENU] if appropriate"
        : undefined;

  const { reply, orderCreated, offerMenu, orderReceipt } = await chatWithGroq(
    phone,
    message,
    history,
    intentHint
  );

  if (orderCreated) {
    clearPendingOrder(phone);
  }

  const replies: BotReply[] = [textReply(reply)];
  if (orderCreated && orderReceipt) {
    replies.push(textReply(orderReceipt));
  }
  if (offerMenu || intent === "recommendation") {
    replies.push(menuOfferButton());
  }

  return replies.length > 1 ? replies : replies[0]!;
}

export async function processMessage(
  phone: string,
  rawMessage: string
): Promise<ProcessResult> {
  const message = normalizeUserMessage(rawMessage);
  if (!message) {
    return textReply("Sorry, I missed that — what were you looking for? 🍕");
  }

  const intent = classifyIntent(message);
  const history = getChatHistory(phone);

  if (shouldShowMenu(message, intent, history)) {
    const reply = startOrdering(phone);
    recordExchange(phone, message, reply);
    return reply;
  }

  if (
    intent === "order_receipt" ||
    intent === "order_tracking" ||
    intent === "delivery_eta"
  ) {
    const reply = handleOrderLookup(phone, message, intent);
    recordExchange(phone, message, reply);
    return reply;
  }

  if (intent === "natural_order") {
    const pizzaNames = extractPizzaNamesFromMessage(message);
    if (pizzaNames.length > 0) {
      const reply = startNaturalOrder(phone, pizzaNames);
      recordExchange(phone, message, reply);
      return reply;
    }
  }

  const pending = getPendingOrder(phone);
  if (pending?.awaiting && isCartAction(message)) {
    const pendingReply = handlePendingSession(phone, message);
    if (pendingReply) {
      recordExchange(phone, message, pendingReply);
      return pendingReply;
    }
  }

  if (intent === "ordering" && isCartAction(message)) {
    if (!pending) {
      setPendingOrder(phone, emptyPending());
    }
    const pendingReply = handlePendingSession(phone, message);
    if (pendingReply) {
      recordExchange(phone, message, pendingReply);
      return pendingReply;
    }
  }

  const groqIntents: Intent[] = [
    "greeting",
    "recommendation",
    "general",
  ];

  if (groqIntents.includes(intent) || (pending?.awaiting && !isCartAction(message))) {
    const reply = await handleGroqIntent(phone, message, intent);
    recordExchange(phone, message, reply);
    return reply;
  }

  const reply = await handleGroqIntent(phone, message, "general");
  recordExchange(phone, message, reply);
  return reply;
}
