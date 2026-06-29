export type BotReply =
  | { kind: "text"; text: string }
  | { kind: "menu_list"; body: string; header?: string; footer?: string };

export function menuListReply(
  body: string,
  options?: { header?: string; footer?: string }
): BotReply {
  return { kind: "menu_list", body, ...options };
}

export function textReply(text: string): BotReply {
  return { kind: "text", text };
}
