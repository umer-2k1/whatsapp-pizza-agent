# WhatsApp AI Pizza Ordering Agent

Conversational pizza ordering over WhatsApp powered by Groq AI, Node.js, TypeScript, and SQLite. Single-shot ordering with no cart — place, confirm, and track orders in natural language.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/installation) 10+
- [Groq API key](https://console.groq.com/)
- [Meta Developer](https://developers.facebook.com/) account with WhatsApp Cloud API access
- [ngrok](https://ngrok.com/) (for local webhook testing)

## Quick start

```bash
pnpm install
cp .env.example .env
# Fill in your API keys in .env
pnpm dev
```

In a second terminal:

```bash
ngrok http 3000
```

Register the ngrok HTTPS URL + `/webhook` in the Meta WhatsApp dashboard.

## Environment variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: `3000`) |
| `GROQ_API_KEY` | Groq API key |
| `WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp Cloud API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp phone number ID from Meta dashboard |
| `WHATSAPP_VERIFY_TOKEN` | Custom verify token for webhook handshake |
| `DATABASE_PATH` | SQLite database path (default: `./data/orders.db`) |

## WhatsApp Cloud API setup

1. Go to [Meta for Developers](https://developers.facebook.com/) and create an app.
2. Add the **WhatsApp** product to your app.
3. In **WhatsApp → API Setup**, note:
   - **Temporary access token** (or generate a permanent one)
   - **Phone number ID**
4. Choose a **Verify Token** (any random string) and set it in `.env` as `WHATSAPP_VERIFY_TOKEN`.
5. Start the server with `pnpm dev`, expose it with ngrok, then set your webhook URL:
   ```
   https://<your-ngrok-id>.ngrok.io/webhook
   ```
6. Subscribe to the **messages** webhook field.
7. Add your test phone number under **WhatsApp → API Setup → To** field.

### Verify webhook with curl

```bash
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
```

Expected response: `test123`

## Menu

| Pizza | Price (PKR) |
|-------|-------------|
| Margherita | 1200 |
| Pepperoni | 1500 |
| BBQ Chicken | 1700 |
| Veggie | 1100 |

## Conversation flows

### Single-shot order

```
User: I want 2 pepperoni pizzas to DHA Phase 5, name is Ali
Bot:  🍕 Order Confirmed!
      Order ID: PZ839201
      Name: Ali
      Items: 2x Pepperoni Pizza
      Total: 3000 PKR
      ...
```

### Multi-turn (missing details)

```
User: 2 pepperoni please
Bot:  What's your name for the order?
User: Ali
Bot:  Please share your delivery address 📍
User: DHA Phase 5
Bot:  🍕 Order Confirmed! ...
```

### Order tracking

```
User: Where is my order?
Bot:  📦 Order Details (latest order for your phone)

User: Track PZ839201
Bot:  📦 Order Details (or "No record found for that order.")
```

### Recommendations

```
User: Suggest something spicy
Bot:  Recommends 1–3 items from the menu with prices
```

### Off-topic

```
User: Who is the president?
Bot:  Politely redirects to pizza ordering
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled production build |

## Architecture

```
WhatsApp User → Meta Cloud API → Express Webhook → Groq AI → Order Service → SQLite → WhatsApp Reply
```

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/webhook` | Meta webhook verification |
| POST | `/webhook` | Incoming WhatsApp messages |

## Security notes

- Webhook verify token is validated on GET `/webhook`
- User messages are sanitized (control chars stripped, 1000 char limit)
- Phone number comes from WhatsApp metadata only
- Duplicate webhook deliveries are deduplicated by message ID

## License

MIT
