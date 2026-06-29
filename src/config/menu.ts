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

export const MENU_ROW_IDS: Record<string, string> = {
  margherita: "Margherita",
  pepperoni: "Pepperoni",
  bbq_chicken: "BBQ Chicken",
  veggie: "Veggie",
};

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function resolveMenuSelection(input: string): string | null {
  const trimmed = input.trim();
  const fromId = MENU_ROW_IDS[trimmed.toLowerCase()];
  if (fromId) return fromId;

  const menuItem = getMenuItem(trimmed);
  return menuItem?.name ?? null;
}

export interface MenuListPayload {
  header?: string;
  body: string;
  footer?: string;
  buttonLabel: string;
  rows: Array<{ id: string; title: string; description: string }>;
}

export function buildMenuListPayload(options?: {
  header?: string;
  body?: string;
  footer?: string;
}): MenuListPayload {
  const idForName = (name: string): string =>
    Object.entries(MENU_ROW_IDS).find(([, n]) => n === name)?.[0] ?? name.toLowerCase();

  return {
    header: options?.header ?? "🍕 Pizza Menu",
    body: options?.body ?? "Tap View Menu and pick a pizza:",
    footer: options?.footer ?? "All prices in PKR",
    buttonLabel: "View Menu",
    rows: MENU.map((item) => ({
      id: idForName(item.name),
      title: item.name,
      description: `${item.price} PKR`,
    })),
  };
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
