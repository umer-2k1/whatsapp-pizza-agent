import {
  isValidMenuItem,
  MENU,
  parseActionButton,
  parseQuantityInput,
  resolveMenuSelection,
  SHOW_MENU_ID,
} from "../config/menu.js";
import { isConfirmingPrefill } from "./orderService.js";

export type Intent =
  | "greeting"
  | "menu_request"
  | "natural_order"
  | "order_receipt"
  | "order_tracking"
  | "delivery_eta"
  | "recommendation"
  | "show_menu"
  | "ordering"
  | "general";

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((p) => text.includes(p));
}

function isMenuRequest(message: string): boolean {
  const lower = normalize(message);

  if (lower === "menu" || lower === "menus") return true;

  if (
    includesAny(lower, [
      "show menu",
      "show me menu",
      "show me the menu",
      "show me menus",
      "show the menu",
      "view menu",
      "see menu",
      "send menu",
      "open menu",
      "full menu",
      "what's on the menu",
      "whats on the menu",
      "what is on the menu",
      "pizza menu",
      "see the menu",
      "send me menu",
      "send me the menu",
    ])
  ) {
    return true;
  }

  if (
    /\b(menu|menus)\b/.test(lower) &&
    /\b(show|view|see|send|display|open|give|get|list)\b/.test(lower)
  ) {
    return true;
  }

  return false;
}

export function isAcceptingMenuOffer(message: string): boolean {
  const lower = normalize(message);

  if (
    isConfirmingPrefill(message) ||
    ["please", "go ahead", "sure thing", "why not"].includes(lower)
  ) {
    return true;
  }

  return includesAny(lower, ["show me", "send it", "send the menu", "show the menu"]);
}

export function wasMenuOfferedRecently(
  history: Array<{ role: string; content: string }>
): boolean {
  const recentAssistant = [...history]
    .reverse()
    .filter((m) => m.role === "assistant")
    .slice(0, 2);

  return recentAssistant.some((msg) => {
    const content = msg.content.toLowerCase();
    return (
      (content.includes("[buttons]") && content.includes("menu")) ||
      content.includes("send the full menu") ||
      content.includes("send the menu") ||
      content.includes("view menu") ||
      content.includes("want me to send") ||
      content.includes("want to see the full menu") ||
      content.includes("get that started") ||
      content.includes("see what we've got")
    );
  });
}

function containsPizzaName(message: string): boolean {
  const lower = normalize(message);
  return MENU.some((item) => lower.includes(normalize(item.name)));
}

export function extractPizzaNamesFromMessage(message: string): string[] {
  const found: string[] = [];
  const lower = normalize(message);

  for (const item of MENU) {
    if (lower.includes(normalize(item.name))) {
      found.push(item.name);
    }
  }

  return found;
}

export function isCartAction(message: string): boolean {
  const lower = normalize(message);
  if (lower === SHOW_MENU_ID) return false;
  if (parseActionButton(lower)) return true;
  if (parseQuantityInput(lower)) return true;
  if (resolveMenuSelection(message)) return true;
  return false;
}

export function classifyIntent(message: string): Intent {
  const lower = normalize(message);

  if (lower === SHOW_MENU_ID) return "show_menu";

  if (parseActionButton(lower) || parseQuantityInput(lower)) return "ordering";

  const menuPick = resolveMenuSelection(message);
  if (menuPick && isValidMenuItem(menuPick)) return "ordering";

  if (isMenuRequest(message)) {
    return "menu_request";
  }

  if (
    includesAny(lower, [
      "what did i order",
      "what have i ordered",
      "what i ordered",
      "what i have ordered",
      "share my order",
      "share what i ordered",
      "can you share what i ordered",
      "order receipt",
      "my last order",
      "my order details",
      "what was my order",
      "receipt",
      "recipet",
      "receit",
    ])
  ) {
    return "order_receipt";
  }

  if (
    includesAny(lower, [
      "track order",
      "track my order",
      "order status",
      "where is my order",
      "where's my order",
    ]) ||
    /\bpz\d{6}\b/i.test(message)
  ) {
    return "order_tracking";
  }

  if (
    includesAny(lower, [
      "when will i receive",
      "when will i get",
      "when will it arrive",
      "how long delivery",
      "how long will it take",
      "delivery time",
      "when is my order coming",
    ])
  ) {
    return "delivery_eta";
  }

  if (
    includesAny(lower, [
      "recommend",
      "suggest",
      "best pizza",
      "hot selling",
      "most popular",
      "must try",
      "must-have",
      "what should i eat",
      "what should i order",
    ])
  ) {
    return "recommendation";
  }

  if (
    /^(hi|hello|hey|salam|assalam|assalamu|good morning|good evening|good afternoon)\b/.test(
      lower
    ) ||
    ["hi", "hello", "hey", "salam"].includes(lower)
  ) {
    return "greeting";
  }

  if (
    includesAny(lower, [
      "i want to order",
      "i want",
      "i'll have",
      "i'll take",
      "get me",
      "order",
      "can i get",
      "can i have",
      "i'd like",
    ]) &&
    containsPizzaName(message)
  ) {
    return "natural_order";
  }

  return "general";
}
