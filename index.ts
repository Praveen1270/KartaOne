/**
 * Karta One — Personal AI Assistant — Entry point.
 * Boots all services, loads skills, and starts the Telegram bot.
 *
 * Architecture overview:
 *   PluginRegistry  — existing browser-automation plugins (Zomato, Swiggy, Shop, Search, Reminders, Chat)
 *   SkillRegistry   — learned skills + builtin skill wrappers (loaded from skills/builtin/ and skills/learned/)
 *   SelfImprover    — writes new TypeScript skills via LLM when no skill/plugin matches
 *   Agent           — orchestrates: skills → plugins → self-improve → chat fallback
 */

import "dotenv/config";
import chalk from "chalk";
import { setupBot } from "./gateway/telegram/bot";
import { Agent } from "./core/agent";
import { LLM } from "./core/llm";
import { Planner } from "./core/planner";
import { PluginRegistry } from "./core/plugin-registry";
import { SkillRegistry } from "./core/skill-registry";
import { SelfImprover } from "./core/self-improver";
import { MemoryStore } from "./memory/store";
import { ZomatoPlugin } from "./plugins/zomato/plugin";
import { SwiggyPlugin } from "./plugins/swiggy/plugin";
import { UniversalShopPlugin } from "./plugins/universal-shop/plugin";
import { SearchPlugin } from "./plugins/search/plugin";
import { RemindersPlugin } from "./plugins/reminders/plugin";
import { ChatPlugin } from "./plugins/chat/plugin";
import { startScheduler } from "./scheduler/autonomous";
import { BrowserEngine } from "./browser/engine";
import { logger } from "./utils/logger";

async function main(): Promise<void> {
  console.log(
    chalk.green(`
╔══════════════════════════════════════════════════╗
║   🧠  KARTA ONE v2.0                             ║
║   Personal AI Assistant                          ║
║   Starting up...                                 ║
╚══════════════════════════════════════════════════╝
`)
  );

  // ── Validate required env vars ────────────────────────────
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error(chalk.red("❌ TELEGRAM_BOT_TOKEN not set. Run: npm run setup"));
    process.exit(1);
  }

  const hasLLM =
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GROQ_API_KEY;

  if (!hasLLM) {
    console.error(chalk.red("❌ No LLM API key set. Run: npm run setup"));
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      chalk.yellow(
        "⚠️  ANTHROPIC_API_KEY not set — self-improvement system requires Claude.\n" +
        "   Skills can still run but new skill generation will be disabled."
      )
    );
  }

  // ── Core services ─────────────────────────────────────────
  const memory  = new MemoryStore();
  const llm     = new LLM();
  const planner = new Planner(llm);

  // ── Plugin registry (existing browser-automation system) ──
  const plugins = new PluginRegistry();
  const remindersPlugin = new RemindersPlugin();

  plugins.register(new ZomatoPlugin());
  plugins.register(new SwiggyPlugin());
  plugins.register(new UniversalShopPlugin());
  plugins.register(new SearchPlugin());
  plugins.register(remindersPlugin);
  plugins.register(new ChatPlugin(llm));

  // ── Skill registry (new self-improvement system) ──────────
  const skills   = new SkillRegistry();
  const improver = new SelfImprover();

  console.log(chalk.cyan("📚 Loading skills..."));
  await skills.loadAll();

  // ── Agent ─────────────────────────────────────────────────
  const agent = new Agent(llm, planner, plugins, skills, improver, memory);

  // ── Telegram bot ──────────────────────────────────────────
  const bot = setupBot(agent, memory);

  // ── Autonomous scheduler (reminders) ──────────────────────
  startScheduler(memory, async (userId, msg) => {
    try {
      await bot.telegram.sendMessage(userId, msg, { parse_mode: "Markdown" });
    } catch (err) {
      logger.error(`Failed to send reminder to ${userId}:`, err);
    }
  });

  // Re-arm any persisted reminders from previous sessions
  await remindersPlugin.rearmAll(memory, async (userId, msg) => {
    await bot.telegram.sendMessage(userId, msg, { parse_mode: "Markdown" }).catch(() => {});
  });

  // ── Launch ────────────────────────────────────────────────
  bot.launch({ dropPendingUpdates: true });

  console.log(chalk.green("✅ Karta One is running!"));
  console.log(chalk.cyan("📱 Open Telegram and message your bot to get started."));
  console.log(chalk.magenta("🧠 Karta One will write new skills on demand when asked."));
  console.log(chalk.yellow(`📊 Logs: ./logs/combined.log\n`));

  logger.info("Karta One — Personal AI Assistant started successfully");

  // ── Graceful shutdown ─────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal} — shutting down...`);
    bot.stop(signal);
    await BrowserEngine.getInstance().close();
    process.exit(0);
  };

  process.once("SIGINT",  () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error(chalk.red("Fatal error:"), err);
  process.exit(1);
});
