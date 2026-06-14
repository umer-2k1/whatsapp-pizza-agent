import type Groq from "groq-sdk";
import { buildSystemPrompt } from "./prompts.js";
import {
  executeToolCall,
  groq,
  GROQ_MODEL,
  toolDefinitions,
} from "./tools.js";
import type { ChatMessage } from "../types/order.js";

export interface GroqResponse {
  reply: string;
  orderCreated: boolean;
}

export async function chatWithGroq(
  phone: string,
  userMessage: string,
  history: ChatMessage[]
): Promise<GroqResponse> {
  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt() },
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
    temperature: 0.4,
    max_tokens: 512,
  });

  let choice = response.choices[0]?.message;
  if (!choice) {
    return { reply: "Sorry, I couldn't process that. Try again? 🍕", orderCreated: false };
  }

  let orderCreated = false;

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
      temperature: 0.4,
      max_tokens: 512,
    });

    choice = response.choices[0]?.message;
    if (!choice) break;
  }

  const reply =
    choice?.content?.trim() ||
    "How can I help you with your pizza order today? 🍕";

  return { reply, orderCreated };
}
