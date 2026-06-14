import Groq from "groq-sdk";
import { env } from "../config/env.js";
import {
  createOrder,
  formatOrderConfirmation,
  formatOrderDetails,
  getMissingField,
  getMissingFieldPrompt,
  getOrder,
  OrderValidationError,
} from "../services/orderService.js";
import { setPendingOrder } from "../services/sessionStore.js";
import type { OrderItemInput } from "../types/order.js";

export const groq = new Groq({ apiKey: env.GROQ_API_KEY });

export const GROQ_MODEL = "llama-3.3-70b-versatile";

export const toolDefinitions: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_order",
      description:
        "Create and confirm a pizza order when customer name, address, and items are all known.",
      parameters: {
        type: "object",
        properties: {
          customer_name: {
            type: "string",
            description: "Customer name for the order",
          },
          address: {
            type: "string",
            description: "Delivery address",
          },
          items: {
            type: "array",
            description: "List of pizzas to order",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Pizza name from menu: Margherita, Pepperoni, BBQ Chicken, or Veggie",
                },
                quantity: {
                  type: "number",
                  description: "Quantity (default 1)",
                },
              },
              required: ["name"],
            },
          },
        },
        required: ["customer_name", "address", "items"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_order",
      description: "Fetch order details by order ID or phone number for tracking.",
      parameters: {
        type: "object",
        properties: {
          order_id: {
            type: "string",
            description: "Order ID like PZ839201",
          },
          phone: {
            type: "string",
            description: "Customer WhatsApp phone number",
          },
        },
      },
    },
  },
];

export interface ToolExecutionResult {
  content: string;
  orderCreated: boolean;
}

export function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  phone: string
): ToolExecutionResult {
  if (name === "create_order") {
    const items = (args.items as OrderItemInput[]) ?? [];
    const customerName = args.customer_name ? String(args.customer_name) : undefined;
    const address = args.address ? String(args.address) : undefined;

    try {
      const order = createOrder({
        phone,
        customerName: customerName ?? "",
        address: address ?? "",
        items,
      });
      return {
        content: formatOrderConfirmation(order),
        orderCreated: true,
      };
    } catch (error) {
      if (error instanceof OrderValidationError) {
        const missing = getMissingField(items, customerName, address);
        if (missing) {
          setPendingOrder(phone, {
            items,
            customerName,
            address,
            awaiting: missing,
            updatedAt: Date.now(),
          });
          return { content: getMissingFieldPrompt(missing), orderCreated: false };
        }
        return { content: error.message, orderCreated: false };
      }
      throw error;
    }
  }

  if (name === "get_order") {
    const orderId = args.order_id ? String(args.order_id) : undefined;
    const lookupPhone = args.phone ? String(args.phone) : phone;
    const order = getOrder({ orderId, phone: lookupPhone });

    if (!order) {
      return {
        content: "No record found for that order.",
        orderCreated: false,
      };
    }

    return {
      content: formatOrderDetails(order),
      orderCreated: false,
    };
  }

  return { content: "Unknown tool.", orderCreated: false };
}
