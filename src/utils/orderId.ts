export function generateOrderId(): string {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `PZ${digits}`;
}
