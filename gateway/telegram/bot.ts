/**
 * Karta One — Telegraf bot setup.
 * Configures commands, security middleware, and routes all messages to the handler.
 *
 * New commands added for the self-improvement system:
 *   /skills  — list all skills (builtin + learned)
 *   /delete  — delete a learned skill
 *   /memory  — show what the agent remembers about you
 *   /forget  — clear agent memory
 */

import { Telegraf, Context } from "telegraf";
import { Agent } from "../../core/agent";
import { MemoryStore } from "../../memory/store";
import { SelfImprover } from "../../core/self-improver";
import { createHandler } from "./handler";
import { sendMessage, sendError } from "./sender";
import { logger } from "../../utils/logger";

const START_MESSAGE = `🙏 *Namaste! I'm Karta One — your Personal AI Assistant.*

I can autonomously:
🍕 Order food on *Zomato/Swiggy* (Cash on Delivery)
🛒 Buy from *Amazon/Flipkart/Meesho* (Cash on Delivery)
🔍 Search anything on the web
⏰ Set reminders
💬 Answer any question
🧠 *Build new skills on demand* — just ask!

The coolest part: if I don't know how to do something, I'll *write the code to do it* — right now, on the spot.

*Examples:*
• "Order butter chicken from Zomato COD"
• "Buy boAt earphones from Flipkart COD"
• "Remind me at 9pm to drink water"
• "Generate clips from this podcast" ← I'll build this skill!
• "Summarise this PDF" ← I'll build this too!`;

const HELP_MESSAGE = `*What I can do:*

🍕 *Food Orders*
  "Order biryani from Zomato COD"
  "Get me a pizza from Swiggy"
  "खाना order करो Zomato से"

🛒 *Shopping*
  "Buy boAt earphones from Flipkart COD"
  "Order Nike shoes from Amazon COD"
  "Meesho से kurti मंगाओ"

🔍 *Search*
  "Best laptop under 50000"
  "Today's Nifty 50 price"

⏰ *Reminders*
  "Remind me at 8pm to exercise"
  "Remind me every day at 7am"

🧠 *New Skills (built on demand)*
  Just ask me to do ANYTHING — I'll write the skill!
  "Generate clips from this podcast"
  "Summarise this PDF"
  "Download this YouTube video"
  
/skills  — see all my current skills
/help    — this message
/memory  — what I remember about you
/forget  — clear my memory

_All orders are Cash on Delivery — no card needed!_`;

export function setupBot(agent: Agent, memory: MemoryStore): Telegraf {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");

  const bot = new Telegraf(token);
  const allowedUserId = process.env.ALLOWED_TELEGRAM_USER_ID;
  const improver = new SelfImprover();

  // ── Security middleware ────────────────────────────────────
  bot.use(async (ctx: Context, next) => {
    if (allowedUserId && ctx.from?.id.toString() !== allowedUserId) {
      await ctx.reply("⛔ Unauthorised access.");
      logger.warn(`Blocked unauthorised user: ${ctx.from?.id}`);
      return;
    }
    return next();
  });

  const messageHandler = createHandler(agent, memory);

  // ── Commands ─────────────────────────────────────────────

  bot.command("start", async (ctx) => {
    await sendMessage(ctx, START_MESSAGE, true);
  });

  bot.command("help", async (ctx) => {
    await sendMessage(ctx, HELP_MESSAGE, true);
  });

  bot.command("skills", async (ctx) => {
    const userId = ctx.from!.id.toString();
    const learned = await improver.listLearnedSkills();

    const builtinList = [
      "💬 Chat & conversation",
      "🔍 Web search (Tavily)",
      "⏰ Reminders & alerts",
      "🍕 Zomato food ordering",
      "🛒 COD shopping (Amazon/Flipkart/Meesho)",
    ];

    const learnedList =
      learned.length > 0
        ? learned.map(
            (s) =>
              `🧠 *${s.displayName}* — used ${s.useCount}x\n   ${s.description}`
          )
        : ["_None yet — just ask me to do something new!_"];

    const total = 5 + learned.length;
    await sendMessage(
      ctx,
      `🛠️ *My Skills (${total} total)*\n\n` +
        `*Built-in:*\n${builtinList.join("\n")}\n\n` +
        `*Self-Learned:*\n${learnedList.join("\n\n")}`,
      true
    );

    void userId; // userId reserved for per-user skill filtering later
  });

  bot.command("delete", async (ctx) => {
    const parts = ctx.message.text.split(" ");
    const skillName = parts[1];
    if (!skillName) {
      await sendMessage(ctx, "Usage: `/delete <skill-name>`\nExample: `/delete podcast-clips`", true);
      return;
    }
    const deleted = await improver.deleteSkill(skillName);
    if (deleted) {
      await sendMessage(ctx, `✅ Skill \`${skillName}\` deleted.`, true);
    } else {
      await sendError(ctx, `Skill "${skillName}" not found in learned skills.`);
    }
  });

  bot.command("memory", async (ctx) => {
    const userId = ctx.from!.id.toString();
    const memories = memory.getMemories(userId);
    const profile = await memory.getProfile(userId);

    const profileLines = [
      profile.name  ? `👤 Name: ${profile.name}` : "",
      profile.phone ? `📱 Phone: ${profile.phone}` : "",
      profile.address.city ? `📍 City: ${profile.address.city}` : "",
    ].filter(Boolean);

    const memoryLines = Object.entries(memories).map(([k, v]) => `• ${k}: ${v}`);

    const lines = [
      ...(profileLines.length ? ["*Profile:*", ...profileLines] : []),
      ...(memoryLines.length ? ["\n*Memories:*", ...memoryLines] : ["_No memories saved yet._"]),
    ];

    await sendMessage(ctx, `🧠 *What I know about you:*\n\n${lines.join("\n")}`, true);
  });

  bot.command("forget", async (ctx) => {
    const userId = ctx.from!.id.toString();
    const conv = await memory.clearConversationHistory(userId);
    const mem = await memory.clearMemories(userId);
    const cleared = conv || mem;
    await sendMessage(
      ctx,
      cleared
        ? "🗑️ Memory cleared! I've forgotten our conversation history."
        : "Nothing to forget — memory was already empty.",
      true
    );
  });

  bot.command("orders", async (ctx) => {
    const userId = ctx.from!.id.toString();
    const orders = memory.getRecentOrders(userId);
    if (!orders.length) {
      await sendMessage(ctx, "You haven't placed any orders yet.", true);
      return;
    }
    const list = orders
      .map(
        (o, i) =>
          `${i + 1}. *${String(o.platform)}* — ₹${Number(o.total)} (${String(o.order_id || "pending")})`
      )
      .join("\n");
    await sendMessage(ctx, `*Your recent orders:*\n\n${list}`, true);
  });

  bot.command("reminders", async (ctx) => {
    const userId = ctx.from!.id.toString();
    const reminders = memory.getUserReminders(userId);
    if (!reminders.length) {
      await sendMessage(ctx, "No active reminders.", true);
      return;
    }
    const list = reminders
      .map(
        (r, i) =>
          `${i + 1}. ${r.message} — ${new Date(r.fireAt * 1000).toLocaleString("en-IN")}`
      )
      .join("\n");
    await sendMessage(ctx, `*Your reminders:*\n\n${list}`, true);
  });

  // ── Route all message types ───────────────────────────────
  bot.on("text",     messageHandler);
  bot.on("document", messageHandler);
  bot.on("photo",    messageHandler);
  bot.on("audio",    messageHandler);
  bot.on("voice",    messageHandler);
  bot.on("video",    messageHandler);

  bot.catch((err: unknown, ctx: Context) => {
    logger.error("Bot error:", err);
    ctx.reply("❌ Internal error. Please try again.").catch(() => {});
  });

  return bot;
}
