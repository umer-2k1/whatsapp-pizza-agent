# WhatsApp Pizza Agent

**A conversational pizza ordering agent that runs entirely on WhatsApp** — no app, no website, no phone calls. Customers message a business number, place orders in natural language, and get confirmations back in the same chat.

---

## Demo

> **[Watch the demo →](https://your-demo-video-link-here)**  
> _Replace the link above with a Loom, YouTube, or screen recording of the agent in action._

---

## The Problem

Small food businesses lose orders when ordering is friction-heavy. Phone lines get busy, websites feel impersonal, and generic chatbots feel robotic. Customers already live on WhatsApp — they just want to order pizza the way they message a friend.

## What It Does

This agent turns a WhatsApp business number into a full ordering channel. Customers can:

- Browse the menu via interactive lists and buttons
- Order in plain language — _"2 pepperoni and a BBQ chicken to DHA Phase 5"_
- Build a multi-item cart with quantity selection
- Get personalized recommendations from a human-sounding staff persona
- Track orders by phone number or order ID
- Receive formatted receipts with totals and delivery details

Repeat customers get their name and address pre-filled. First-time customers are guided conversationally until every detail is captured — nothing is assumed or fabricated.

## Why It Exists

Most WhatsApp bot demos are rigid keyword matchers or generic AI wrappers with no real order logic behind them. This project shows what a **production-shaped** conversational commerce agent looks like:

- Structured ordering flows alongside free-form AI
- Tool-calling AI that only creates orders when all required fields are confirmed
- Persistent order storage with real IDs and lookup
- Native WhatsApp interactive UI (lists, reply buttons)
- Intent routing so greetings, menus, tracking, and orders each get the right response

It's a reference implementation for **AI + WhatsApp Cloud API + transactional backend** — built to be extended, not just demoed.

## How It Works

```
Customer (WhatsApp)
       ↓
Meta WhatsApp Cloud API
       ↓
Express webhook  →  Intent classifier
       ↓                    ↓
Conversation service  ←  Groq AI (tool calls)
       ↓
Order service  →  SQLite
       ↓
WhatsApp reply (text / buttons / menu list)
```

**Incoming message** → sanitized and classified by intent (greeting, menu, order, tracking, recommendation).

**Guided flow** → interactive menus and buttons walk the customer through item selection, quantities, and checkout — with a live cart summary.

**Natural language** → Groq handles open-ended conversation, collects missing details, and calls `create_order` or `get_order` tools only when criteria are met.

**Outgoing reply** → formatted as plain text, WhatsApp reply buttons, or scrollable menu lists depending on context.

Orders are stored in SQLite with generated IDs (`PZ######`), linked to the customer's WhatsApp phone number for tracking.

## Key Capabilities

| Area | Behavior |
|------|----------|
| **Ordering** | Multi-item cart, quantity buttons, natural-language pizza extraction |
| **AI persona** | Configurable shop name and staff identity — replies like a real team member |
| **Validation** | Orders require explicit name, address, and items — no silent defaults |
| **Repeat customers** | Previous name/address offered for one-tap confirmation |
| **Tracking** | Lookup by order ID or latest order for the phone number |
| **Interactive UI** | WhatsApp menu lists, reply buttons, and structured receipts |
| **Safety** | Input sanitization, webhook verification, duplicate message deduplication |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js, TypeScript |
| Server | Express |
| AI | Groq (LLM + function calling) |
| Messaging | Meta WhatsApp Cloud API |
| Database | SQLite (`better-sqlite3`) |
| Validation | Zod |
| Local dev | ngrok (webhook tunneling) |

---

## Setup

This README focuses on what the project is and how it works. For environment variables, Meta dashboard configuration, webhook registration, and local testing, see the full guide:

**[Setup & Testing Guide →](docs/SETUP_AND_TESTING_GUIDE.md)**

Quick start: `pnpm install` → configure `.env` → `pnpm dev` → expose with ngrok → register webhook in Meta.

## License

MIT
