import Groq from "groq-sdk";
import { env } from "../config/env.js";
import {
  createOrder,
  formatNoOrderFound,
  formatOrderReceipt,
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
        "Create and confirm a pizza order ONLY when you have EXPLICITLY collected and confirmed ALL three requirements from the customer in this conversation: (1) customer name, (2) complete delivery address with area/street, and (3) at least one pizza with quantity. DO NOT call this tool if any field is missing, assumed, or not explicitly provided by the customer. DO NOT use default values. If missing details, ask the customer for them first.",
      parameters: {
        type: "object",
        properties: {
          customer_name: {
            type: "string",
            description:
              "Customer's full name - MUST be explicitly provided by customer, do not assume or use placeholders",
          },
          address: {
            type: "string",
            description:
              "Complete delivery address with area/street - MUST be explicitly provided by customer",
          },
          items: {
            type: "array",
            description:
              "List of pizzas with quantities - customer must have confirmed what they want",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description:
                    "Pizza name from menu: Margherita, Pepperoni, BBQ Chicken, Veggie, Chicken Tikka, or Meat Lovers",
                },
                quantity: {
                  type: "number",
                  description: "Quantity (default 1 if customer didn't specify)",
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
      description:
        "Fetch order details by order ID or phone. Use when customer asks what they ordered, order receipt, delivery timing, order status, or when their order will arrive.",
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
  orderReceipt?: string;
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

    if (!customerName?.trim() || customerName.trim().length < 2) {
      return {
        content:
          "I need the customer's name before I can create the order. Please ask for their name.",
        orderCreated: false,
      };
    }

    if (!address?.trim() || address.trim().length < 5) {
      return {
        content:
          "I need a complete delivery address before I can create the order. Please ask for the full address with area/street.",
        orderCreated: false,
      };
    }

    if (!items || items.length === 0) {
      return {
        content:
          "I need at least one pizza item before I can create the order. Please ask what they'd like to order.",
        orderCreated: false,
      };
    }

    try {
      const order = createOrder({
        phone,
        customerName,
        address,
        items,
      });
      return {
        content:
          "SUCCESS: Order placed. Reply with 1-2 warm sentences confirming the order (use the customer's name). Say you're sharing the full receipt below. Do NOT list items, prices, address, or order ID — the receipt is sent automatically in the next message.",
        orderCreated: true,
        orderReceipt: formatOrderReceipt(order),
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
        content: formatNoOrderFound(),
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
