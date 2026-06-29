import { DELIVERY_ESTIMATE, SHOP_NAME } from "../config/shop.js";
import type { CreateOrderInput, Order, OrderItemInput } from "../types/order.js";
import {
  calculateTotal,
  getMenuItem,
  isValidMenuItem,
  resolveOrderItems,
} from "../config/menu.js";
import {
  findLatestOrderByPhone,
  findOrderByOrderId,
  insertOrder,
  orderIdExists,
} from "../db/orders.js";
import { generateOrderId } from "../utils/orderId.js";

export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderValidationError";
  }
}

export function validateItems(items: OrderItemInput[]): void {
  if (!items || items.length === 0) {
    throw new OrderValidationError("What are you in the mood for? 🍕");
  }

  for (const item of items) {
    if (!isValidMenuItem(item.name)) {
      throw new OrderValidationError(
        "Ah, we only do the pizzas on our menu — want me to send it over?"
      );
    }
  }
}

function createUniqueOrderId(): string {
  let orderId = generateOrderId();
  let attempts = 0;
  while (orderIdExists(orderId) && attempts < 10) {
    orderId = generateOrderId();
    attempts++;
  }
  return orderId;
}

export function createOrder(input: CreateOrderInput): Order {
  const customerName = input.customerName?.trim();
  const address = input.address?.trim();

  if (!customerName) {
    throw new OrderValidationError("What name should I put on the order?");
  }

  if (!address) {
    throw new OrderValidationError("Where should we deliver it? Drop your address 📍");
  }

  validateItems(input.items);

  const resolvedItems = resolveOrderItems(input.items);
  const total = calculateTotal(resolvedItems);
  const orderId = createUniqueOrderId();

  return insertOrder({
    order_id: orderId,
    phone: input.phone,
    customer_name: customerName,
    items: resolvedItems,
    address,
    total,
    status: "CONFIRMED",
  });
}

export function getOrder(params: {
  orderId?: string;
  phone?: string;
}): Order | null {
  if (params.orderId) {
    return findOrderByOrderId(params.orderId);
  }

  if (params.phone) {
    return findLatestOrderByPhone(params.phone);
  }

  return null;
}

export function formatItemsSummary(items: Order["items"]): string {
  return items.map((item) => `${item.quantity}x ${item.name}`).join(", ");
}

function parseOrderDate(createdAt: string): Date {
  const normalized = createdAt.includes("T")
    ? createdAt
    : `${createdAt.replace(" ", "T")}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatPlacedAt(createdAt: string): string {
  return new Intl.DateTimeFormat("en-PK", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Karachi",
  }).format(parseOrderDate(createdAt));
}

function formatExpectedDeliveryTime(createdAt: string): string {
  const placed = parseOrderDate(createdAt);
  const eta = new Date(placed.getTime() + 60 * 60 * 1000);
  const etaTime = new Intl.DateTimeFormat("en-PK", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Karachi",
  }).format(eta);

  return `~${etaTime} (${DELIVERY_ESTIMATE})`;
}

export function formatOrderReceipt(order: Order): string {
  const itemLines = order.items.map((item) => {
    const lineTotal = item.price * item.quantity;
    return `  • ${item.quantity}x *${item.name}*\n    ${item.price} PKR each → *${lineTotal} PKR*`;
  });

  return [
    `🍕 *${SHOP_NAME}*`,
    `─────────────────`,
    `*ORDER RECEIPT*`,
    `─────────────────`,
    "",
    `🧾 *Order ID:* ${order.order_id}`,
    `✅ *Status:* ${order.status}`,
    "",
    `👤 *Customer:* ${order.customer_name}`,
    `📍 *Delivery address:*\n   ${order.address}`,
    "",
    `*Items ordered:*`,
    ...itemLines,
    "",
    `💰 *Order total:* ${order.total} PKR`,
    "",
    `🕐 *Placed on:* ${formatPlacedAt(order.created_at)}`,
    `🛵 *Expected delivery:* ${formatExpectedDeliveryTime(order.created_at)}`,
    `─────────────────`,
    `Thanks for ordering! 😊`,
  ].join("\n");
}

export function formatCartSummary(items: OrderItemInput[]): string {
  if (items.length === 0) {
    return "🛒 Nothing in the cart yet.";
  }

  const lines = items.map((item) => {
    const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
    const menuItem = getMenuItem(item.name);
    const lineTotal = menuItem ? menuItem.price * qty : 0;
    return `• ${qty}x *${item.name}* — ${lineTotal} PKR`;
  });

  const total = items.reduce((sum, item) => {
    const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
    const menuItem = getMenuItem(item.name);
    return sum + (menuItem ? menuItem.price * qty : 0);
  }, 0);

  return ["🛒 *So far you've got:*", ...lines, "", `*Subtotal:* ${total} PKR`].join("\n");
}

export function formatOrderIntro(order: Order): string {
  const firstName = order.customer_name.split(" ")[0];
  return `✅ Perfect, *${firstName}*! Your order is confirmed 🍕\nHere are your order details 👇`;
}

export function formatOrderConfirmation(order: Order): string {
  return [formatOrderIntro(order), "", formatOrderReceipt(order)].join("\n");
}

export function formatOrderDetails(order: Order): string {
  return formatOrderReceipt(order);
}

export function formatDeliveryEta(order: Order): string {
  const firstName = order.customer_name.split(" ")[0];
  return [
    `Hey *${firstName}*! Your order is on the way 🛵`,
    "",
    formatOrderReceipt(order),
  ].join("\n");
}

export function formatNoOrderFound(): string {
  return "Hmm, I'm not seeing an order on this number yet 🤔 Want to place one? 🍕";
}

export function getMissingField(
  items: OrderItemInput[],
  customerName?: string,
  address?: string
): "item" | "name" | "address" | null {
  if (!items || items.length === 0) return "item";
  if (!customerName?.trim()) return "name";
  if (!address?.trim()) return "address";
  return null;
}

export function getMissingFieldPrompt(field: "item" | "name" | "address"): string {
  switch (field) {
    case "item":
      return "What are you in the mood for? 🍕";
    case "name":
      return "What name should I put on the order? 😊";
    case "address":
      return "Where should we deliver it? Drop your address 📍";
  }
}

export function isConfirmingPrefill(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return ["yes", "yep", "yeah", "correct", "same", "ok", "okay", "sure"].includes(lower);
}
