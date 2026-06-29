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
  { name: "Chicken Tikka", price: 1600 },
  { name: "Meat Lovers", price: 1800 },
];

export const MENU_ROW_IDS: Record<string, string> = {
  margherita: "Margherita",
  pepperoni: "Pepperoni",
  bbq_chicken: "BBQ Chicken",
  veggie: "Veggie",
  chicken_tikka: "Chicken Tikka",
  meat_lovers: "Meat Lovers",
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

const QTY_BUTTON_PREFIX = "qty_";
export const ADD_ANOTHER_ID = "add_another";
export const DONE_ORDER_ID = "done_order";
export const SHOW_MENU_ID = "show_menu";

export function quantityButtonId(qty: number): string {
  return `${QTY_BUTTON_PREFIX}${qty}`;
}

export function parseQuantityInput(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.startsWith(QTY_BUTTON_PREFIX)) {
    const qty = Number.parseInt(trimmed.slice(QTY_BUTTON_PREFIX.length), 10);
    return qty > 0 && qty <= 99 ? qty : null;
  }
  const qty = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(qty) && qty > 0 && qty <= 99) return qty;
  return null;
}

export function parseActionButton(input: string): "add_another" | "done_order" | null {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === ADD_ANOTHER_ID) return "add_another";
  if (trimmed === DONE_ORDER_ID) return "done_order";
  return null;
}
