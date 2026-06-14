import type { Order, OrderItem } from "../types/order.js";
import { getDb } from "./connection.js";

interface OrderRow {
  id: number;
  order_id: string;
  phone: string;
  customer_name: string;
  items: string;
  address: string;
  total: number;
  status: string;
  created_at: string;
}

function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    order_id: row.order_id,
    phone: row.phone,
    customer_name: row.customer_name,
    items: JSON.parse(row.items) as OrderItem[],
    address: row.address,
    total: row.total,
    status: row.status,
    created_at: row.created_at,
  };
}

export function insertOrder(order: {
  order_id: string;
  phone: string;
  customer_name: string;
  items: OrderItem[];
  address: string;
  total: number;
  status: string;
}): Order {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO orders (order_id, phone, customer_name, items, address, total, status)
    VALUES (@order_id, @phone, @customer_name, @items, @address, @total, @status)
  `);

  const result = stmt.run({
    order_id: order.order_id,
    phone: order.phone,
    customer_name: order.customer_name,
    items: JSON.stringify(order.items),
    address: order.address,
    total: order.total,
    status: order.status,
  });

  const row = db
    .prepare("SELECT * FROM orders WHERE id = ?")
    .get(result.lastInsertRowid) as OrderRow;

  return rowToOrder(row);
}

export function findOrderByOrderId(orderId: string): Order | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM orders WHERE order_id = ? COLLATE NOCASE")
    .get(orderId) as OrderRow | undefined;
  return row ? rowToOrder(row) : null;
}

export function findLatestOrderByPhone(phone: string): Order | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM orders WHERE phone = ? ORDER BY created_at DESC LIMIT 1")
    .get(phone) as OrderRow | undefined;
  return row ? rowToOrder(row) : null;
}

export function orderIdExists(orderId: string): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT 1 FROM orders WHERE order_id = ?")
    .get(orderId);
  return !!row;
}
