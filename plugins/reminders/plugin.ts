/**
 * Reminders Plugin — set, list, and cancel reminders via node-schedule.
 * Reminders are persisted to SQLite and survive restarts via the scheduler.
 */

import schedule from "node-schedule";
import { PluginBase, PluginResult, AgentContext } from "../../core/plugin-base";
import { MemoryStore } from "../../memory/store";
import { logger } from "../../utils/logger";

type SendFn = (userId: string, msg: string) => Promise<void>;

// Active scheduled jobs keyed by DB reminder ID
const activeJobs = new Map<number, schedule.Job>();

export class RemindersPlugin extends PluginBase {
  name = "reminders";
  description = "Set reminders, alerts, and scheduled messages";
  triggers = [
    "remind", "reminder", "alert", "notify", "schedule",
    "at ", "every day", "every morning", "every night",
    "याद दिलाओ", "याद", "remind me",
  ];

  constructor(private memory?: MemoryStore, private sendFn?: SendFn) {
    super();
  }

  /** Call this on startup to re-arm any persisted reminders. */
  async rearmAll(memory: MemoryStore, sendFn: SendFn): Promise<void> {
    this.memory = memory;
    this.sendFn = sendFn;
    const pending = memory.getPendingReminders();
    for (const r of pending) {
      this.scheduleJob(r.id, r.userId, r.message, new Date(r.fireAt * 1000), memory, sendFn);
    }
    logger.info(`Re-armed ${pending.length} reminder(s)`);
  }

  async run(input: string, context: AgentContext): Promise<PluginResult> {
    const lower = input.toLowerCase();

    // List reminders
    if (lower.includes("list") || lower.includes("show") || lower.includes("what reminders")) {
      return this.listReminders(context.userId);
    }

    // Cancel a reminder
    if (lower.includes("cancel") || lower.includes("delete") || lower.includes("remove")) {
      const id = parseInt(lower.match(/\d+/)?.[0] ?? "0", 10);
      if (id) return this.cancelReminder(context.userId, id);
    }

    // Parse time from input
    const parsed = parseReminderTime(input);
    if (!parsed) {
      return this.error(
        "❓ I couldn't understand the time. Try:\n" +
        `• "Remind me at 8pm to exercise"\n` +
        `• "Remind me in 30 minutes to take medicine"\n` +
        `• "Remind me every day at 7am to drink water"`
      );
    }

    const { fireAt, message, cron } = parsed;
    if (!this.memory || !this.sendFn) {
      return this.error("Reminders are not initialised yet.");
    }

    const id = this.memory.saveReminder(context.userId, message, fireAt, cron);
    this.scheduleJob(id, context.userId, message, fireAt, this.memory, this.sendFn);

    const timeStr = cron
      ? `every day at ${fireAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
      : fireAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    logger.info(`Reminder #${id} set for ${context.userId}: "${message}" at ${timeStr}`);
    return this.success(`⏰ Reminder set!\n\n*"${message}"*\n🕐 ${timeStr}`);
  }

  private listReminders(userId: string): PluginResult {
    if (!this.memory) return this.error("Memory not available");
    const reminders = this.memory.getUserReminders(userId);
    if (!reminders.length) return this.success("📭 You have no active reminders.");

    const list = reminders
      .map(
        (r, i) =>
          `${i + 1}. *${r.message}*\n   🕐 ${new Date(r.fireAt * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} (ID: ${r.id})`
      )
      .join("\n\n");

    return this.success(`⏰ *Your reminders:*\n\n${list}\n\nTo cancel: "cancel reminder 1"`);
  }

  private cancelReminder(userId: string, id: number): PluginResult {
    if (!this.memory) return this.error("Memory not available");
    const job = activeJobs.get(id);
    job?.cancel();
    activeJobs.delete(id);
    const deleted = this.memory.deleteReminder(userId, id);
    return deleted
      ? this.success(`✅ Reminder #${id} cancelled.`)
      : this.error(`❌ Reminder #${id} not found.`);
  }

  private scheduleJob(
    id: number,
    userId: string,
    message: string,
    fireAt: Date,
    memory: MemoryStore,
    sendFn: SendFn
  ): void {
    const job = schedule.scheduleJob(fireAt, async () => {
      await sendFn(userId, `⏰ *Reminder:* ${message}`);
      memory.markReminderFired(id);
      activeJobs.delete(id);
      logger.info(`Reminder #${id} fired for ${userId}`);
    });

    if (job) {
      activeJobs.set(id, job);
    }
  }
}

// ── Time parser ─────────────────────────────────────────────

interface ParsedReminder {
  fireAt: Date;
  message: string;
  cron?: string;
}

function parseReminderTime(input: string): ParsedReminder | null {
  const now = new Date();
  const lower = input.toLowerCase();

  // Extract message part (after "to" keyword)
  const toMatch = input.match(/\bto\b\s+(.+?)(?:\s+at\b|\s+in\b|$)/i);
  const message = toMatch?.[1]?.trim() ?? input.replace(/remind(?: me)?/i, "").trim();

  // "in X minutes/hours"
  const inMatch = lower.match(/in\s+(\d+)\s+(minute|hour|min|hr)s?/);
  if (inMatch) {
    const amount = parseInt(inMatch[1] ?? "0", 10);
    const unit = inMatch[2] ?? "";
    const ms = unit.startsWith("h") ? amount * 3600000 : amount * 60000;
    return { fireAt: new Date(now.getTime() + ms), message };
  }

  // "at H:MM am/pm" or "at Hpm"
  const atMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (atMatch) {
    let hours = parseInt(atMatch[1] ?? "0", 10);
    const minutes = parseInt(atMatch[2] ?? "0", 10);
    const ampm = atMatch[3];
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;

    const fireAt = new Date();
    fireAt.setHours(hours, minutes, 0, 0);
    if (fireAt <= now) fireAt.setDate(fireAt.getDate() + 1); // Next occurrence

    const isDaily = lower.includes("every") || lower.includes("daily");
    const cron = isDaily ? `${minutes} ${hours} * * *` : undefined;

    return { fireAt, message, cron };
  }

  // "tomorrow at ..."
  if (lower.includes("tomorrow")) {
    const timeMatch = lower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1] ?? "8", 10);
      const minutes = parseInt(timeMatch[2] ?? "0", 10);
      const ampm = timeMatch[3];
      if (ampm === "pm" && hours < 12) hours += 12;
      const fireAt = new Date();
      fireAt.setDate(fireAt.getDate() + 1);
      fireAt.setHours(hours, minutes, 0, 0);
      return { fireAt, message };
    }
  }

  return null;
}
