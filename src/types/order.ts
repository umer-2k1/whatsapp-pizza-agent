export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface OrderItemInput {
  name: string;
  quantity?: number;
}

export interface Order {
  id: number;
  order_id: string;
  phone: string;
  customer_name: string;
  items: OrderItem[];
  address: string;
  total: number;
  status: string;
  created_at: string;
}

export interface CreateOrderInput {
  phone: string;
  customerName: string;
  items: OrderItemInput[];
  address: string;
}

export interface PendingOrder {
  items: OrderItemInput[];
  customerName?: string;
  address?: string;
  awaiting: "name" | "address" | "item" | null;
  updatedAt: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
