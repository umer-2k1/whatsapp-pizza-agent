import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required"),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1, "WHATSAPP_ACCESS_TOKEN is required"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1, "WHATSAPP_PHONE_NUMBER_ID is required"),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1, "WHATSAPP_VERIFY_TOKEN is required"),
  DATABASE_PATH: z.string().default("./data/orders.db"),
  WEBHOOK_URL: z.string().url().optional(),
  NGROK_API_URL: z.string().url().default("http://127.0.0.1:4040"),
});

export const env = envSchema.parse(process.env);
