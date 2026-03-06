/**
 * Autonomous scheduler — polls for pending reminders and fires them.
 * Runs every minute in the background as long as the agent is alive.
 */

import schedule from "node-schedule";
import { MemoryStore } from "../memory/store";
import { logger } from "../utils/logger";

type SendFn = (userId: string, msg: string) => Promise<void>;

export function startScheduler(memory: MemoryStore, sendFn: SendFn): void {
  // Poll every minute for due reminders
  schedule.scheduleJob("* * * * *", async () => {
    try {
      const pending = memory.getPendingReminders();
      for (const reminder of pending) {
        logger.info(`Firing reminder #${reminder.id} for ${reminder.userId}: "${reminder.message}"`);
        await sendFn(reminder.userId, `⏰ *Reminder:* ${reminder.message}`);
        memory.markReminderFired(reminder.id);
      }
    } catch (err) {
      logger.error("Scheduler error:", err);
    }
  });

  logger.info("Autonomous scheduler started (polling every minute)");
}
