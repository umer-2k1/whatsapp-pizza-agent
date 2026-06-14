import {
  calculateTotal,
  isValidMenuItem,
  resolveOrderItems,
} from "../config/menu.js";
import {
  findLatestOrderByPhone,
  findOrderByOrderId,
  insertOrder,
  orderIdExists,
} from "../db/orders.js";
import type { CreateOrderInput, Order, OrderItemInput } from "../types/order.js";
import { generateOrderId } from "../utils/orderId.js";

export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderValidationError";
  }
}

export function validateItems(items: OrderItemInput[]): void {
  if (!items || items.length === 0) {
    throw new OrderValidationError("Which pizza would you like? 🍕");
  }

  for (const item of items) {
    if (!isValidMenuItem(item.name)) {
      throw new OrderValidationError("We only serve pizzas from our menu 🍕");
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
    throw new OrderValidationError("What's your name for the order?");
  }

  if (!address) {
    throw new OrderValidationError("Please share your delivery address 📍");
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
  return items
    .map((item) => `${item.quantity}x ${item.name} Pizza`)
    .join(", ");
}

export function formatOrderConfirmation(order: Order): string {
  return [
    "🍕 Order Confirmed!",
    "",
    `Order ID: ${order.order_id}`,
    `Name: ${order.customer_name}`,
    `Items: ${formatItemsSummary(order.items)}`,
    `Total: ${order.total} PKR`,
    `Address: ${order.address}`,
    "Delivery: 1 hour ⏱️",
    "",
    "Your pizza is being prepared! 🍕🔥",
  ].join("\n");
}

export function formatOrderDetails(order: Order): string {
  return [
    "📦 Order Details",
    "",
    `Order ID: ${order.order_id}`,
    `Name: ${order.customer_name}`,
    `Items: ${formatItemsSummary(order.items)}`,
    `Total: ${order.total} PKR`,
    `Address: ${order.address}`,
    `Status: ${order.status}`,
    `Placed: ${order.created_at}`,
    "Delivery: 1 hour ⏱️",
  ].join("\n");
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
      return "Which pizza would you like? 🍕";
    case "name":
      return "What's your name for the order?";
    case "address":
      return "Please share your delivery address 📍";
  }
}
