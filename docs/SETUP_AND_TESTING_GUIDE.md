# WhatsApp Pizza Agent — Setup & Testing Guide

Complete guide for running the agent locally and testing it on WhatsApp.

---

## Table of contents

1. [What you need](#what-you-need)
2. [How the system works](#how-the-system-works)
3. [WhatsApp Cloud API setup](#whatsapp-cloud-api-setup)
4. [Environment configuration](#environment-configuration)
5. [Run the server locally](#run-the-server-locally)
6. [Expose with ngrok](#expose-with-ngrok)
7. [Register the webhook in Meta](#register-the-webhook-in-meta)
8. [Test on WhatsApp](#test-on-whatsapp)
9. [Troubleshooting](#troubleshooting)
10. [Production vs demo](#production-vs-demo)

---

## What you need

| Requirement | Why | Where to get it |
|-------------|-----|-----------------|
| **Meta Developer account** | Access WhatsApp Cloud API | [developers.facebook.com](https://developers.facebook.com/) |
| **Meta app with WhatsApp product** | Sends and receives messages | Meta Developer Dashboard |
| **WhatsApp Access Token** | Authenticates API calls to Meta | WhatsApp → API Setup |
| **Phone Number ID** | Identifies your WhatsApp business number | WhatsApp → API Setup |
| **Verify Token** (you choose this) | Secures webhook registration | Any random string, e.g. `my_pizza_secret_123` |
| **Your personal phone number** | Added as a test recipient | WhatsApp → API Setup → "To" field |
| **Groq API key** | Powers the AI assistant | [console.groq.com](https://console.groq.com/) |
| **ngrok** | Exposes localhost so Meta can reach your webhook | [ngrok.com](https://ngrok.com/) |
| **Node.js 20+** | Runs the server | [nodejs.org](https://nodejs.org/) |
| **pnpm 10+** | Package manager | [pnpm.io](https://pnpm.io/) |

> **Important:** In development mode, Meta gives you a **free test WhatsApp number**. You can only message **phone numbers you've added as test recipients** — not any random WhatsApp user.

---

## How the system works

### Architecture flow

```
Your Phone (WhatsApp)
        ↓
Meta WhatsApp Cloud API
        ↓
POST /webhook  (your Node.js server)
        ↓
Conversation Service
        ↓
Groq AI (intent + tool calls)
        ↓
Order Service → SQLite database
        ↓
WhatsApp API (send reply)
        ↓
Your Phone (WhatsApp)
```

### Message processing steps

1. You send a WhatsApp message to the **Meta test business number**.
2. Meta forwards it to your server via **POST `/webhook`**.
3. The server sanitizes the message and checks for a pending order session.
4. **Groq AI** understands intent (order, track, recommend, menu) and may call tools:
   - `create_order` — saves order to SQLite
   - `get_order` — fetches order by ID or phone
5. The server sends the reply back through Meta's API.
6. You receive the bot response on WhatsApp.

### Order rules

- **No cart** — single-shot ordering only
- **Required fields:** customer name, delivery address, at least one menu item
- **Phone number** comes from WhatsApp automatically (not typed by user)
- **Default quantity:** 1 if not specified

### Menu

| Pizza | Price (PKR) |
|-------|-------------|
| Margherita | 1200 |
| Pepperoni | 1500 |
| BBQ Chicken | 1700 |
| Veggie | 1100 |

---

## WhatsApp Cloud API setup

### Step 1 — Create a Meta app

1. Go to [developers.facebook.com](https://developers.facebook.com/)
2. Click **My Apps → Create App**
3. Choose **Other** → **Business** (or **Business** type)
4. Name it e.g. `Pizza Ordering Agent`
5. In the app dashboard, click **Add Product → WhatsApp → Set up**

### Step 2 — Get your credentials

Open **WhatsApp → API Setup**. Copy these values:

| Dashboard field | `.env` variable |
|-----------------|-----------------|
| Temporary access token (click Copy) | `WHATSAPP_ACCESS_TOKEN` |
| Phone number ID (below the test number) | `WHATSAPP_PHONE_NUMBER_ID` |
| *(you create this yourself)* | `WHATSAPP_VERIFY_TOKEN` |

The **verify token** is any secret string you invent. Meta sends it back during webhook registration to confirm you own the server.

### Step 3 — Add your phone as a test recipient

In **API Setup**, find **"To"** (Send messages to):

1. Click **Manage phone number list**
2. Add your personal WhatsApp number with country code (e.g. `923001234567`)
3. Meta sends a verification code to your WhatsApp — enter it

Only numbers on this list can chat with your test bot.

---

## Environment configuration

Copy the example file and fill in your keys:

```bash
cp .env.example .env
```

Example `.env`:

```env
PORT=3000
GROQ_API_KEY=gsk_xxxxxxxxxxxx
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxx
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_VERIFY_TOKEN=my_pizza_secret_123
DATABASE_PATH=./data/orders.db
```

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: `3000`) |
| `GROQ_API_KEY` | Groq API key from [console.groq.com](https://console.groq.com/) |
| `WHATSAPP_ACCESS_TOKEN` | Meta WhatsApp Cloud API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp phone number ID from Meta dashboard |
| `WHATSAPP_VERIFY_TOKEN` | Custom verify token for webhook handshake (must match Meta) |
| `DATABASE_PATH` | SQLite database path (default: `./data/orders.db`) |
| `WEBHOOK_URL` | Optional manual ngrok webhook URL override |
| `NGROK_API_URL` | ngrok local API for auto-detection (default: `http://127.0.0.1:4040`) |

---

## Run the server locally

```bash
pnpm install
pnpm dev
```

Expected output:

```
WhatsApp Pizza Agent running on port 3000
Webhook URL: http://localhost:3000/webhook
```

### Verify locally

Health check:

```bash
curl http://localhost:3000/health
```

Expected: `{"status":"ok"}`

Webhook verification test:

```bash
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test123"
```

Expected: `test123`

> **Note:** If you see `Could not locate the bindings file`, run:
> ```bash
> rm -rf node_modules && pnpm install
> ```

---

## Expose with ngrok

Meta needs a **public HTTPS URL**. Run ngrok in a **separate terminal** from the server.

**Terminal 1 — server:**
```bash
pnpm dev
```

**Terminal 2 — ngrok:**
```bash
ngrok http 3000
```

The server auto-detects ngrok and prints the HTTPS webhook URL on startup. If you start ngrok after the server, restart `pnpm dev` or call:

```bash
curl http://localhost:3000/health
```

Register the `webhookUrl` from the output in Meta → WhatsApp → Configuration.

> **Optional:** Set `WEBHOOK_URL=https://your-id.ngrok-free.app/webhook` in `.env` to skip auto-detection.

---

## Register the webhook in Meta

> **Important:** The "Check test webhooks" page (API Testing) shows events Meta received, but your server only gets messages if the **Configuration webhook** is set up correctly. Open ngrok inspect at [http://127.0.0.1:4040](http://127.0.0.1:4040) — when you send a WhatsApp message you should see `POST /webhook`. If you don't, Meta is not reaching your server.

1. Go to **WhatsApp → Configuration** (NOT "API Testing")
2. Click **Edit** on the Callback URL
3. Enter:
   - **Callback URL:** `https://YOUR-NGROK-ID.ngrok-free.dev/webhook`
   - **Verify token:** same as `WHATSAPP_VERIFY_TOKEN` in `.env`
4. Click **Verify and Save**
5. Under **Webhook fields**, toggle **`messages`** to **Subscribed** (must show green/subscribed)
6. Send a test WhatsApp message and confirm `POST /webhook` appears in ngrok inspect

### If messages still don't arrive

- Re-save the webhook URL (ngrok URL may have changed)
- Confirm both `pnpm dev` and `ngrok http 3000` are running
- In Meta, click a row in "Check test webhooks" and check **delivery status** — if it shows failed, the callback URL is wrong or unreachable
- Add your phone as a test recipient under **API Setup → To**

### If verification fails

- Server must be running (`pnpm dev`)
- ngrok must be running
- Verify token in Meta must **exactly** match `.env`
- Use the **HTTPS** ngrok URL, not HTTP

---

## Test on WhatsApp

Open WhatsApp on your phone and message the **test business number** shown in Meta's API Setup (not your own number).

### Test 1 — Menu / greeting

**Send:**
```
Hi
What's on the menu?
```

**Expected:** Friendly reply with the 4 pizzas and prices.

---

### Test 2 — Single-shot order

**Send:**
```
I want 2 pepperoni pizzas to DHA Phase 5, my name is Ali
```

**Expected:**
```
🍕 Order Confirmed!

Order ID: PZxxxxxx
Name: Ali
Items: 2x Pepperoni Pizza
Total: 3000 PKR
Address: DHA Phase 5
Delivery: 1 hour ⏱️

Your pizza is being prepared! 🍕🔥
```

---

### Test 3 — Multi-turn order (missing details)

**Send:**
```
2 pepperoni please
```
**Bot:** What's your name for the order?

**Send:**
```
Ali
```
**Bot:** Please share your delivery address 📍

**Send:**
```
DHA Phase 5
```
**Bot:** Order confirmed with full details.

---

### Test 4 — Recommendations

**Send:**
```
Suggest something good
What's your best pizza?
```

**Expected:** 1–3 menu suggestions with prices.

---

### Test 5 — Order tracking

**Send:**
```
Where is my order?
```

**Expected:** Your latest order details for your phone number.

**Send:**
```
Track PZ123456
```

**Expected:** That specific order, or `No record found for that order.`

---

### Test 6 — Invalid item

**Send:**
```
I want a burger
```

**Expected:** `We only serve pizzas from our menu 🍕`

---

### Test 7 — Off-topic redirect

**Send:**
```
Who won the cricket match?
```

**Expected:** Polite redirect back to pizza ordering.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| No reply on WhatsApp | Webhook not registered or ngrok down | Check ngrok + Meta webhook config |
| Webhook verify fails | Token mismatch | Match `WHATSAPP_VERIFY_TOKEN` in `.env` and Meta |
| `Could not locate bindings file` | better-sqlite3 not built | `rm -rf node_modules && pnpm install` |
| Meta API error in terminal | Expired access token | Generate a new token in API Setup |
| Message sent but no bot reply | Groq key missing/invalid | Check `GROQ_API_KEY` in `.env` |
| Can't message the bot number | Phone not added as test recipient | Add your number in API Setup → To |
| ngrok URL changed | Free ngrok restarts | Update webhook URL in Meta dashboard |
| Duplicate replies | Webhook retried by Meta | Normal — dedup handles this automatically |

Check your server terminal for errors when you send a message. Failed Groq or WhatsApp API calls are logged there.

---

## Production vs demo

| | Demo (current) | Production |
|--|----------------|------------|
| WhatsApp number | Meta test number | Verified business number |
| Who can message | Test recipients only | Anyone |
| Access token | Temporary (24h) | Permanent system user token |
| Hosting | localhost + ngrok | Cloud server with HTTPS |
| Meta requirements | Developer account | Verified Meta Business |

For production, you need a **verified Meta Business** account and an approved WhatsApp Business number. That is out of scope for this demo.

---

## Quick checklist

- [ ] Meta app created with WhatsApp product
- [ ] `.env` filled with all 5 keys
- [ ] Your phone added as test recipient in Meta
- [ ] `pnpm dev` running
- [ ] ngrok running on port 3000
- [ ] Webhook registered: `https://<ngrok-id>/webhook`
- [ ] `messages` webhook field subscribed
- [ ] Test message sent from your phone to the Meta test number

Once all boxes are checked, you should receive AI replies within a few seconds.

---

## API endpoints reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/webhook` | Meta webhook verification |
| POST | `/webhook` | Incoming WhatsApp messages |

---

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start dev server with hot reload |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled production build |
