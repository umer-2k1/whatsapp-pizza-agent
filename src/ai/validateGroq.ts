import Groq from "groq-sdk";
import { env } from "../config/env.js";

export async function validateGroqKey(): Promise<void> {
  const groq = new Groq({ apiKey: env.GROQ_API_KEY });
  try {
    await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    });
    console.log("Groq API key: OK");
  } catch (error) {
    console.error(
      "⚠ Groq API key is invalid or expired. Get a new key at https://console.groq.com/keys"
    );
    console.error(error instanceof Error ? error.message : error);
  }
}
