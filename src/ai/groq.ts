import type Groq from "groq-sdk";
import { SHOP_NAME } from "../config/shop.js";
import { buildSystemPrompt } from "./prompts.js";
import {
  executeToolCall,
  groq,
  GROQ_MODEL,
  toolDefinitions,
} from "./tools.js";
import type { ChatMessage } from "../types/order.js";

const OFFER_MENU_TAG = "[OFFER_MENU]";

export interface GroqResponse {
  reply: string;
  orderCreated: boolean;
  offerMenu: boolean;
  orderReceipt?: string;
}

function parseGroqReply(raw: string): { reply: string; offerMenu: boolean } {
  const offerMenu = raw.includes(OFFER_MENU_TAG);
  const reply = raw.replace(OFFER_MENU_TAG, "").trim();
  return { reply, offerMenu };
}

export async function chatWithGroq(
  phone: string,
  userMessage: string,
  history: ChatMessage[],
  intentHint?: string
): Promise<GroqResponse> {
  const intentContext = intentHint
    ? `\n\nConversation context: The customer's message looks like a "${intentHint}" — respond naturally for that intent.`
    : "";

  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt() + intentContext },
    ...history.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    {
      role: "user",
      content: `Customer phone: ${phone}\n\nMessage: ${userMessage}`,
    },
  ];

  let response = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages,
    tools: toolDefinitions,
    tool_choice: "auto",
    temperature: 0.7,
    max_tokens: 512,
  });

  let choice = response.choices[0]?.message;
  if (!choice) {
    return {
      reply: "Sorry, I missed that — what were you looking for?",
      orderCreated: false,
      offerMenu: false,
    };
  }

  let orderCreated = false;
  let orderReceipt: string | undefined;

  while (choice.tool_calls && choice.tool_calls.length > 0) {
    messages.push(choice);

    for (const toolCall of choice.tool_calls) {
      const fn = toolCall.function;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(fn.arguments) as Record<string, unknown>;
      } catch {
        args = {};
      }

      const result = executeToolCall(fn.name, args, phone);
      if (result.orderCreated) {
        orderCreated = true;
        orderReceipt = result.orderReceipt;
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result.content,
      });
    }

    response = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      tools: toolDefinitions,
      tool_choice: "auto",
      temperature: 0.7,
      max_tokens: 512,
    });

    choice = response.choices[0]?.message;
    if (!choice) break;
  }

  const rawReply =
    choice?.content?.trim() ||
    `Hey! Welcome to *${SHOP_NAME}* 🍕 What can I get for you today?`;

  const { reply, offerMenu } = parseGroqReply(rawReply);

  return { reply, orderCreated, offerMenu, orderReceipt };
}
