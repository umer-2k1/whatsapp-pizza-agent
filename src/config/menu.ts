import type { OrderItem, OrderItemInput } from "../types/order.js";

export interface MenuItem {
  name: string;
  price: number;
}

export const MENU: MenuItem[] = [
  { name: "Margherita", price: 1200 },
  { name: "Pepperoni", price: 1500 },
  { name: "BBQ Chicken", price: 1700 },
  { name: "Veggie", price: 1100 },
];

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function getMenuItem(name: string): MenuItem | undefined {
  const normalized = normalizeName(name);
  return MENU.find((item) => normalizeName(item.name) === normalized);
}

export function isValidMenuItem(name: string): boolean {
  return getMenuItem(name) !== undefined;
}

export function calculateTotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function resolveOrderItems(items: OrderItemInput[]): OrderItem[] {
  return items.map((item) => {
    const menuItem = getMenuItem(item.name);
    if (!menuItem) {
      throw new Error(`Invalid menu item: ${item.name}`);
    }
    return {
      name: menuItem.name,
      quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
      price: menuItem.price,
    };
  });
}

export function formatMenuForPrompt(): string {
  return MENU.map((item) => `- ${item.name}: ${item.price} PKR`).join("\n");
}

export const RECOMMENDATION_TRIGGERS = [
  "recommend",
  "suggest",
  "best pizza",
  "what should i eat",
  "hot selling",
];
