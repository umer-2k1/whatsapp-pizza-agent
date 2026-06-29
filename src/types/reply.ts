export type BotReply =
  | { kind: "text"; text: string }
  | { kind: "menu_list"; body: string; header?: string; footer?: string }
  | {
      kind: "buttons";
      body: string;
      buttons: Array<{ id: string; title: string }>;
      header?: string;
      footer?: string;
    };

export type ProcessResult = BotReply | BotReply[];

export function menuListReply(
  body: string,
  options?: { header?: string; footer?: string }
): BotReply {
  return { kind: "menu_list", body, ...options };
}

export function buttonReply(
  body: string,
  buttons: Array<{ id: string; title: string }>,
  options?: { header?: string; footer?: string }
): BotReply {
  return { kind: "buttons", body, buttons, ...options };
}

export function textReply(text: string): BotReply {
  return { kind: "text", text };
}
