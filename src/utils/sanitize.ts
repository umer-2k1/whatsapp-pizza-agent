const MAX_LENGTH = 1000;

export function sanitizeInput(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim()
    .slice(0, MAX_LENGTH);
}

export function sanitizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}
