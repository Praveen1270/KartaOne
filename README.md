# 🧠 Karta One — Personal AI Assistant

**Self-evolving autonomous AI assistant built for India.**

Karta One runs entirely on Telegram. It remembers everything you tell it, orders food, buys products, searches the web, sets reminders — and when it doesn't know how to do something, it builds the capability itself.

---

## Features

- **Persistent memory** — Tell it your name, city, preferences once. It remembers forever.
- **Food ordering** — Order from Zomato or Swiggy via Cash on Delivery, fully automated.
- **Shopping** — Buy from Amazon, Flipkart, Meesho COD without opening any app.
- **Web search** — Real-time answers powered by Tavily.
- **Reminders** — "Remind me at 9pm to drink water" — it just works.
- **Self-improvement** — Ask it to do something new. If it can't, it writes the code to do it (requires Claude API key).

---

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/Praveen1270/KartaOne.git
cd KartaOne
npm install
```

### 2. Run the setup wizard

```bash
npm run setup
```

The wizard asks for just 4 things:

| Step | What |
|------|------|
| 1 | Your LLM provider & API key (Groq is free and fast) |
| 2 | Telegram Bot Token — create one via [@BotFather](https://t.me/botfather) |
| 3 | Your Telegram User ID — get it from [@userinfobot](https://t.me/userinfobot) |
| 4 | Tavily API key for web search (optional, free at [tavily.com](https://tavily.com)) |

> No delivery address needed during setup — just tell the bot your address in chat and it will remember it.

### 3. Start

```bash
npm start
```

Then open Telegram and message your bot.

---

## Telegram Commands

| Command | What it does |
|---------|--------------|
| `/start` | Welcome message |
| `/skills` | List all available skills |
| `/memory` | See what the bot remembers about you |
| `/forget` | Clear memory and conversation history |
| `/orders` | View recent order history |
| `/reminders` | View active reminders |
| `/help` | Usage examples |

---

## Example Conversations

```
You:  "My name is Praveen and I live in Chennai"
Bot:  "Got it Praveen! I'll remember that."
      (Saves your name and city permanently)

You:  "Order butter chicken from Zomato"
Bot:  Searches Zomato, adds to cart, shows summary, asks YES/NO, places order COD

You:  "Buy boAt earphones from Flipkart"
Bot:  Finds the product, adds to cart, confirms, places COD order

You:  "Remind me tomorrow at 8am to call the doctor"
Bot:  "✅ Reminder set for tomorrow 8:00 AM"

You:  "Search for the best monsoon destinations in India"
Bot:  Returns live web search results

You:  "Generate a summary from this PDF"
Bot:  Builds a new skill on the fly (requires Claude API key), then runs it
```

---

## How Memory Works

When you tell the bot something about yourself, it automatically extracts and saves the facts:

- "My name is Praveen" → saves `name: Praveen`
- "I live in Hyderabad" → saves `city: Hyderabad`
- "I prefer vegetarian food" → saves `food_preference: vegetarian`

These are stored in a local SQLite database and included in every future conversation so the bot always knows who you are.

---

## Supported LLM Providers

| Provider | Free tier | Best for |
|----------|-----------|----------|
| **Groq** (Llama 3.3) | ✅ Generous free tier | Fast everyday use |
| **Claude** (Anthropic) | ❌ Paid | Self-improvement feature |
| **GPT-4o** (OpenAI) | ❌ Paid | High quality responses |
| **Gemini** (Google) | ✅ Free tier | Alternative option |

> Self-improvement (writing new skills) requires a Claude API key. All other features work with any provider.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_PROVIDER` | Yes | `groq` / `claude` / `openai` / `gemini` |
| `GROQ_API_KEY` | If using Groq | From [console.groq.com](https://console.groq.com) |
| `ANTHROPIC_API_KEY` | For self-improvement | From [console.anthropic.com](https://console.anthropic.com) |
| `OPENAI_API_KEY` | If using OpenAI | From [platform.openai.com](https://platform.openai.com) |
| `GEMINI_API_KEY` | If using Gemini | From [aistudio.google.com](https://aistudio.google.com) |
| `TELEGRAM_BOT_TOKEN` | Yes | From [@BotFather](https://t.me/botfather) |
| `ALLOWED_TELEGRAM_USER_ID` | Yes | Your Telegram user ID |
| `TAVILY_API_KEY` | Optional | For web search |

---

## Architecture

```
Karta One/
├── index.ts                    ← Entry point
├── setup.ts                    ← 4-step setup wizard
│
├── core/
│   ├── agent.ts                ← Route → Skill → Plugin → Self-improve → Chat
│   ├── llm.ts                  ← Groq / Claude / GPT-4o / Gemini factory
│   ├── planner.ts              ← Natural language → execution plan
│   ├── skill-base.ts           ← Skill interface & SkillContext
│   ├── skill-registry.ts       ← Loads builtin + learned skills
│   └── self-improver.ts        ← Writes new skills via Claude
│
├── skills/
│   ├── builtin/
│   │   ├── chat/               ← Conversational fallback (uses your memories)
│   │   ├── search/             ← Tavily web search
│   │   ├── reminders/          ← Set & fire reminders
│   │   ├── zomato/             ← Zomato ordering wrapper
│   │   ├── shop/               ← Amazon / Flipkart / Meesho
│   │   └── self-improve/       ← "list skills", "delete skill X"
│   └── learned/                ← Auto-generated skills saved here
│
├── plugins/
│   ├── zomato/                 ← Full Zomato browser automation
│   ├── swiggy/                 ← Full Swiggy browser automation
│   └── universal-shop/         ← Amazon / Flipkart / Meesho automation
│
├── memory/
│   ├── store.ts                ← SQLite: profiles, history, memories, orders
│   └── context.ts              ← Builds SkillContext with memory attached
│
├── browser/
│   ├── engine.ts               ← Stealth Playwright Chromium
│   └── vision.ts               ← Claude Vision for screenshot understanding
│
├── gateway/telegram/
│   ├── bot.ts                  ← Bot setup & commands
│   └── handler.ts              ← Message handler, file downloads, askUser()
│
└── sandbox/
    ├── validator.ts            ← Safety check for generated code
    ├── tester.ts               ← Runs skill tests in isolated subprocess
    └── executor.ts             ← Timeout-wrapped skill execution
```

---

## SkillContext API

Every skill (builtin or self-generated) receives a full `SkillContext`:

```typescript
context.reply(text)                    // Send a message to the user
context.replyWithFile(path, caption?)  // Send a file
context.replyWithPhoto(path, caption?) // Send an image
context.askUser(question)              // Ask something, wait for reply
context.updateMessage(text)            // Edit the last progress message
context.saveMemory(key, value)         // Persist a fact about the user
context.updateProfile(updates)         // Update user profile fields
context.message                        // The original user message
context.profile                        // Name, phone, address, city
context.memory                         // All saved key-value memories
context.history                        // Recent conversation history
context.files[]                        // Files uploaded by the user
```

---

## Safety

Self-generated skills go through multiple checks before running:

1. **Static analysis** — blocks `rm -rf`, `eval()`, `process.exit()`, raw TCP, env tampering
2. **Isolated testing** — runs in a child process with a 60-second timeout
3. **Tmp-only output** — skills are instructed to only write files to the system temp directory
4. **Single-user access** — `ALLOWED_TELEGRAM_USER_ID` blocks everyone else

---

## Development

```bash
npm run dev     # Hot-reload with ts-node-dev
npm run build   # Compile TypeScript to dist/
npm run setup   # Re-run the setup wizard
```
