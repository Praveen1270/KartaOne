# 🧠 Karta One — Personal AI Assistant

**Self-evolving autonomous AI assistant for India.**

Karta One never says *"I can't do that."*  
Instead it **writes the code to do it**, tests it, installs it, and runs it — all in real time.

---

## What Makes This Different

Most AI agents have a fixed set of tools. Karta One has an evolving skill library.

When you ask it to do something it doesn't know how to do:

```
You: "Generate clips from this podcast"
       ↓
Karta One checks skill registry → no skill found
       ↓
SelfImprover asks Claude to write a TypeScript skill
       ↓
sandbox/validator.ts — safety check (no rm -rf, no eval, etc.)
       ↓
sandbox/tester.ts — runs tests in isolated child process
       ↓
Tests pass → skill saved to skills/learned/podcast-clips/
           → npm packages installed
           → registered in skill-registry.json
           → hot-loaded without restart
           → executed immediately on your podcast
       ↓
Next time you say "clip this" → loads instantly, no re-generation
```

---

## Architecture

```
karta-one/
│
├── index.ts                    ← Entry point
├── setup.ts                    ← Interactive terminal wizard
│
├── core/
│   ├── agent.ts                ← Main agent loop (skills → plugins → self-improve)
│   ├── llm.ts                  ← Claude / GPT-4o / Gemini / Groq factory
│   ├── planner.ts              ← Goal → execution plan
│   ├── plugin-registry.ts      ← Existing plugin system
│   ├── plugin-base.ts          ← Plugin interface
│   ├── skill-base.ts           ← ⭐ Skill interface (superset of plugin)
│   ├── skill-registry.ts       ← ⭐ Loads builtin + learned skills
│   └── self-improver.ts        ← ⭐ Writes new skills via LLM
│
├── sandbox/
│   ├── validator.ts            ← ⭐ Safety check (blocks dangerous patterns)
│   ├── tester.ts               ← ⭐ Runs skill tests in isolated subprocess
│   └── executor.ts             ← ⭐ Timeout-wrapped skill execution
│
├── skills/
│   ├── builtin/                ← Ships with the agent (never deleted)
│   │   ├── chat/skill.ts
│   │   ├── search/skill.ts
│   │   ├── reminders/skill.ts
│   │   ├── zomato/skill.ts
│   │   ├── shop/skill.ts
│   │   └── self-improve/skill.ts  ← ⭐ "list skills", "delete skill X"
│   │
│   └── learned/                ← ⭐ Auto-generated at runtime
│       ├── skill-registry.json ← Index of all learned skills
│       └── <skill-name>/
│           ├── skill.ts
│           ├── skill.test.ts
│           ├── manifest.json
│           └── deps.json
│
├── plugins/                    ← Existing browser automation (Zomato, Swiggy, Shop)
├── browser/                    ← Playwright stealth browser
├── gateway/telegram/           ← Telegram bot (files, askUser, updateMessage)
├── memory/                     ← SQLite long-term memory
└── utils/
    ├── files.ts                ← ⭐ Telegram file download helpers
    ├── logger.ts
    └── helpers.ts
```

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure

```bash
npm run setup
```

The wizard asks for:
- **LLM API key** (Claude recommended — required for self-improvement)
- **Telegram Bot Token** (create via [@BotFather](https://t.me/botfather))
- **Your Telegram User ID** (get from [@userinfobot](https://t.me/userinfobot))
- **Delivery address** (for food & shopping orders)

### 3. Start Karta One

```bash
npm start
```

---

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/skills` | List all skills (builtin + learned) |
| `/help` | Usage examples |
| `/delete <skill>` | Delete a learned skill |
| `/memory` | What the agent remembers about you |
| `/forget` | Clear memory and conversation history |
| `/orders` | Recent order history |
| `/reminders` | Active reminders |

---

## Built-in Skills

| Skill | Triggers | Description |
|-------|----------|-------------|
| 🍕 Zomato | "order", "zomato", "food", "biryani"… | Order food from Zomato COD |
| 🛒 Shop | "buy", "amazon", "flipkart", "meesho"… | Buy products COD |
| 🔍 Search | "search", "find", "what is"… | Web search via Tavily |
| ⏰ Reminders | "remind", "alert", "schedule"… | Set/manage reminders |
| 🧠 Self-Improve | "list skills", "delete skill"… | Manage the skill system |
| 💬 Chat | *(fallback)* | LLM conversation |

---

## How Self-Improvement Works

1. User sends a message that matches no skill or plugin trigger in Karta One
2. `SelfImprover.createSkill()` is called with the user's request
3. Claude is prompted to write a complete TypeScript skill (up to 3 attempts)
4. `SandboxValidator` scans for dangerous patterns:
   - `rm -rf`, `process.exit()`, `eval()`, `new Function()`
   - File operations outside `/tmp`
   - Raw TCP/UDP access, env tampering, crypto mining
5. npm packages declared in the manifest are installed
6. `SandboxTester` runs the skill's test file in an isolated `ts-node` subprocess
7. If tests pass: skill is saved to `skills/learned/`, registered in `skill-registry.json`, and hot-loaded
8. The skill is executed immediately on the user's original request
9. All future matching requests load the skill instantly from disk

### What Claude generates for each skill:

```
skills/learned/<skill-name>/
├── skill.ts          ← The full TypeScript skill class
├── skill.test.ts     ← Auto-generated tests
├── manifest.json     ← Metadata, triggers, version
└── deps.json         ← npm packages
```

---

## File Upload Support

Send any file to the bot and skills can access it:

```
context.files[0].path     ← Local path to the downloaded file
context.files[0].fileName ← Original filename
context.files[0].mimeType ← e.g. "audio/mpeg", "application/pdf"
context.files[0].size     ← File size in bytes
```

Supported types: documents, photos, audio, voice messages, video

---

## SkillContext API

Every skill receives a `SkillContext` with:

```typescript
context.reply(text)                        // Send text to user
context.replyWithFile(path, caption?)      // Send file to user
context.replyWithPhoto(path, caption?)     // Send image to user
context.askUser(question)                  // Pause and wait for user reply
context.updateMessage(text)                // Edit previous progress message
context.files[]                            // Files user sent
context.message                            // Original user message
context.profile                            // User profile (name, city, phone)
context.memory                             // Key-value memories
context.history                            // Conversation history
```

---

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | **Yes** (for self-improvement) | Claude API key |
| `TELEGRAM_BOT_TOKEN` | **Yes** | From @BotFather |
| `ALLOWED_TELEGRAM_USER_ID` | **Yes** | Your Telegram user ID |
| `LLM_PROVIDER` | No (default: `claude`) | `claude` / `openai` / `gemini` / `groq` |
| `TAVILY_API_KEY` | No | For web search |
| `ZOMATO_PHONE` | No | For Zomato ordering |
| `SWIGGY_PHONE` | No | For Swiggy ordering |

---

## Logs

```
logs/combined.log   ← All activity
logs/error.log      ← Errors only
```

---

## Development

```bash
npm run dev    # Hot-reload with ts-node-dev
npm run build  # Compile to dist/
```

---

## Safety

The self-improvement system has multiple layers of protection:

1. **Static analysis** — `SandboxValidator` blocks 15+ dangerous code patterns before any code runs
2. **Isolated testing** — Skills run in a child process with a 60-second timeout before activation
3. **Restricted output** — LLM-generated skills are instructed to only write files to `/tmp`
4. **No direct shell** — `child_process.exec/execSync` are blocked patterns
5. **Single user** — `ALLOWED_TELEGRAM_USER_ID` restricts access to only you
