let webhookUrl = "";

export function setWebhookUrl(url: string): void {
  webhookUrl = url;
}

export function getWebhookUrl(): string {
  return webhookUrl;
}
