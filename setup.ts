/**
 * Karta One — Interactive terminal setup wizard.
 * Run once with: npx ts-node setup.ts
 * Asks questions, validates API keys, writes .env, and installs Playwright browsers.
 */

import * as readline from "readline";
import * as fs from "fs";
import * as https from "https";
import { execSync } from "child_process";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (question: string): Promise<string> =>
  new Promise((resolve) => rl.question(question, resolve));

const askSecret = (question: string): Promise<string> =>
  new Promise((resolve) => {
    process.stdout.write(question);
    let input = "";

    const isRaw = process.stdin.isTTY;
    if (isRaw) {
      process.stdin.setRawMode(true);
    }

    const onData = (char: Buffer) => {
      const c = char.toString();
      if (c === "\n" || c === "\r" || c === "\r\n") {
        process.stdout.write("\n");
        cleanup();
        resolve(input);
      } else if (c === "\u0003") {
        process.exit();
      } else if (c === "\u007f" || c === "\b") {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(question + "*".repeat(input.length));
        }
      } else {
        input += c;
        process.stdout.write("*");
      }
    };

    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      if (isRaw) process.stdin.setRawMode(false);
    };

    process.stdin.on("data", onData);
  });

async function validateTelegramToken(token: string): Promise<boolean> {
  return new Promise((resolve) => {
    https
      .get(`https://api.telegram.org/bot${token}/getMe`, (res) => {
        resolve(res.statusCode === 200);
      })
      .on("error", () => resolve(false));
  });
}

async function main(): Promise<void> {
  console.clear();
  console.log(`
╔═══════════════════════════════════════════════╗
║   🧠  KARTA ONE — Setup Wizard                ║
║   Personal AI Assistant                       ║
╚═══════════════════════════════════════════════╝
`);
  console.log("This wizard sets up your agent in ~3 minutes.\n");

  const config: Record<string, string> = {};

  // ── STEP 1: LLM Provider ──────────────────────────────────
  console.log("━━━ STEP 1: Choose your AI Brain ━━━\n");
  console.log("  1. Claude (Anthropic) — Best quality, recommended ✨");
  console.log("  2. GPT-4o (OpenAI)    — Excellent alternative");
  console.log("  3. Gemini (Google)    — Generous free tier");
  console.log("  4. Groq (Llama)       — Free & very fast\n");

  const llmChoice = await ask("Choose (1-4) [1]: ");
  const llmMap: Record<string, [string, string]> = {
    "1": ["claude",  "ANTHROPIC_API_KEY"],
    "2": ["openai",  "OPENAI_API_KEY"],
    "3": ["gemini",  "GEMINI_API_KEY"],
    "4": ["groq",    "GROQ_API_KEY"],
  };
  const [provider, keyName] = llmMap[llmChoice.trim() || "1"] ?? llmMap["1"]!;
  config["LLM_PROVIDER"] = provider;

  const apiKey = await askSecret(`\nEnter your ${keyName}: `);
  config[keyName] = apiKey;
  console.log("  ✓ API key saved\n");

  // ── STEP 2: Telegram ──────────────────────────────────────
  console.log("━━━ STEP 2: Telegram Bot ━━━\n");
  console.log("  1. Open Telegram → search @BotFather");
  console.log("  2. Send /newbot and follow instructions");
  console.log("  3. Copy the token it gives you\n");

  let telegramToken = "";
  let telegramValid = false;
  while (!telegramValid) {
    telegramToken = await askSecret("Enter your Telegram Bot Token: ");
    process.stdout.write("  Validating token...");
    telegramValid = await validateTelegramToken(telegramToken);
    if (!telegramValid) {
      console.log(" ✗ Invalid token. Try again.");
    } else {
      console.log(" ✓ Valid!\n");
    }
  }
  config["TELEGRAM_BOT_TOKEN"] = telegramToken;

  // ── STEP 3: Your Telegram User ID ─────────────────────────
  console.log("━━━ STEP 3: Your Telegram User ID ━━━\n");
  console.log("  Open Telegram → search @userinfobot → send /start\n");
  config["ALLOWED_TELEGRAM_USER_ID"] = await ask("Enter your Telegram User ID: ");

  // ── STEP 4: Delivery Address ──────────────────────────────
  console.log("\n━━━ STEP 4: Default Delivery Address ━━━\n");
  config["DEFAULT_ADDRESS_LINE1"] = await ask("Address Line 1 (flat/building): ");
  config["DEFAULT_ADDRESS_LINE2"] = await ask("Address Line 2 (area/landmark): ");
  config["DEFAULT_CITY"]    = await ask("City: ");
  config["DEFAULT_PINCODE"] = await ask("Pincode: ");
  config["DEFAULT_PHONE"]   = await ask("Phone number: ");
  config["DEFAULT_NAME"]    = await ask("Your name: ");

  // ── STEP 5: Optional ─────────────────────────────────────
  console.log("\n━━━ STEP 5: Optional Features ━━━\n");

  const wantsSearch = await ask("Enable web search? (Tavily — free at tavily.com) y/n [y]: ");
  if (wantsSearch.trim().toLowerCase() !== "n") {
    config["TAVILY_API_KEY"] = await askSecret("Tavily API Key (Enter to skip): ");
  }

  const wantsZomato = await ask("\nHave a Zomato account? y/n [y]: ");
  if (wantsZomato.trim().toLowerCase() !== "n") {
    config["ZOMATO_PHONE"] = await ask("  Zomato phone number: ");
  }

  const wantsSwiggy = await ask("\nHave a Swiggy account? y/n [y]: ");
  if (wantsSwiggy.trim().toLowerCase() !== "n") {
    config["SWIGGY_PHONE"] = await ask("  Swiggy phone number: ");
  }

  // ── STEP 6: Safety Limits ─────────────────────────────────
  console.log("\n━━━ STEP 6: Safety Settings ━━━\n");
  const maxAmount = await ask("Max COD order without confirmation (₹) [500]: ");
  config["MAX_ORDER_AMOUNT"] = maxAmount.trim() || "500";
  config["REQUIRE_CONFIRMATION"] = "true";
  config["TIMEZONE"]  = "Asia/Kolkata";
  config["LOG_LEVEL"] = "info";

  // ── Write .env ────────────────────────────────────────────
  const envLines = Object.entries(config)
    .filter(([, v]) => v.trim() !== "")
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  fs.writeFileSync(".env", envLines + "\n");
  console.log("\n  ✓ Configuration saved to .env\n");

  // ── Install Playwright ────────────────────────────────────
  console.log("━━━ Installing Chromium browser ━━━\n");
  try {
    execSync("npx playwright install chromium --with-deps", { stdio: "inherit" });
  } catch {
    console.log("  ⚠️  Playwright install had issues. Run manually: npx playwright install chromium");
  }

  console.log(`
╔═══════════════════════════════════════════════╗
║   ✅  Karta One Setup Complete!               ║
╠═══════════════════════════════════════════════╣
║                                               ║
║   Start Karta One:                            ║
║   $ npm start                                 ║
║                                               ║
║   Then message your Telegram bot!             ║
║                                               ║
║   Try:                                        ║
║   "Order butter chicken from Zomato COD"      ║
║   "Buy boAt earphones from Flipkart COD"      ║
║   "Remind me at 9pm to drink water"           ║
║   "Generate clips from this podcast"          ║
╚═══════════════════════════════════════════════╝
`);
  rl.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
