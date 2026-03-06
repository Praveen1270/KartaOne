/**
 * SQLite-based memory store using Node.js 22 built-in `node:sqlite`.
 * Zero native dependencies — works on Windows/Mac/Linux without compilation.
 * Persists conversation history, user profiles, memories, and order records.
 */

import { DatabaseSync } from "node:sqlite";
import * as path from "path";
import * as fs from "fs";
import { CREATE_TABLES } from "./schema";
import { UserProfile, DeliveryAddress } from "../core/plugin-base";
import { logger } from "../utils/logger";

const DB_PATH = path.join(process.cwd(), "data", "orderclaw.db");

type Row = Record<string, string | number | null | bigint | Uint8Array>;

export class MemoryStore {
  private db: DatabaseSync;

  constructor() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec(CREATE_TABLES);
    logger.info(`Karta One SQLite store ready: ${DB_PATH}`);
  }

  // ── User Profile ──────────────────────────────────────────

  getProfile(userId: string): UserProfile {
    this.ensureUser(userId);
    const row = this.db
      .prepare(
        `SELECT name, phone, addr_line1, addr_line2, city, pincode, addr_phone, language, preferences
         FROM users WHERE id = ?`
      )
      .get(userId) as Row;

    const address: DeliveryAddress = {
      line1: String(row.addr_line1 || process.env.DEFAULT_ADDRESS_LINE1 || ""),
      line2: String(row.addr_line2 || process.env.DEFAULT_ADDRESS_LINE2 || ""),
      city: String(row.city || process.env.DEFAULT_CITY || ""),
      pincode: String(row.pincode || process.env.DEFAULT_PINCODE || ""),
      phone: String(row.addr_phone || process.env.DEFAULT_PHONE || ""),
      name: String(row.name || process.env.DEFAULT_NAME || "User"),
    };

    return {
      name: String(row.name || process.env.DEFAULT_NAME || "User"),
      phone: String(row.phone || process.env.DEFAULT_PHONE || ""),
      address,
      language: String(row.language || "en"),
      preferences: JSON.parse(String(row.preferences || "{}")) as Record<string, unknown>,
    };
  }

  updateProfile(userId: string, updates: Partial<UserProfile>): void {
    this.ensureUser(userId);
    const addr = updates.address;
    this.db
      .prepare(
        `UPDATE users SET
          name        = COALESCE(?, name),
          phone       = COALESCE(?, phone),
          addr_line1  = COALESCE(?, addr_line1),
          addr_line2  = COALESCE(?, addr_line2),
          city        = COALESCE(?, city),
          pincode     = COALESCE(?, pincode),
          addr_phone  = COALESCE(?, addr_phone),
          language    = COALESCE(?, language),
          preferences = COALESCE(?, preferences),
          updated_at  = strftime('%s', 'now')
        WHERE id = ?`
      )
      .run(
        updates.name ?? null,
        updates.phone ?? null,
        addr?.line1 ?? null,
        addr?.line2 ?? null,
        addr?.city ?? null,
        addr?.pincode ?? null,
        addr?.phone ?? null,
        updates.language ?? null,
        updates.preferences ? JSON.stringify(updates.preferences) : null,
        userId
      );
  }

  // ── Conversation History ──────────────────────────────────

  getHistory(userId: string): Array<{ role: string; content: string }> {
    this.ensureUser(userId);
    const rows = this.db
      .prepare(
        `SELECT role, content FROM conversations
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 20`
      )
      .all(userId) as Row[];
    return rows.reverse().map((r) => ({ role: String(r.role), content: String(r.content) }));
  }

  saveConversation(userId: string, userMsg: string, assistantMsg: string): void {
    this.ensureUser(userId);
    this.db.prepare(
      `INSERT INTO conversations (user_id, role, content) VALUES (?, 'user', ?)`
    ).run(userId, userMsg);
    this.db.prepare(
      `INSERT INTO conversations (user_id, role, content) VALUES (?, 'assistant', ?)`
    ).run(userId, assistantMsg);
    this.pruneHistory(userId);
  }

  private pruneHistory(userId: string): void {
    this.db
      .prepare(
        `DELETE FROM conversations WHERE user_id = ? AND id NOT IN (
           SELECT id FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
         )`
      )
      .run(userId, userId);
  }

  // ── Key-Value Memories ────────────────────────────────────

  getMemories(userId: string): Record<string, string> {
    this.ensureUser(userId);
    const rows = this.db
      .prepare(`SELECT key, value FROM memories WHERE user_id = ?`)
      .all(userId) as Row[];
    return Object.fromEntries(rows.map((r) => [String(r.key), String(r.value)]));
  }

  setMemory(userId: string, key: string, value: string): void {
    this.ensureUser(userId);
    this.db
      .prepare(
        `INSERT INTO memories (user_id, key, value, updated_at)
         VALUES (?, ?, ?, strftime('%s', 'now'))
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(userId, key, value);
  }

  // ── Orders ────────────────────────────────────────────────

  saveOrder(userId: string, data: Record<string, unknown>): void {
    this.ensureUser(userId);
    this.db
      .prepare(
        `INSERT INTO orders (user_id, platform, order_id, items, total, raw_data)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        userId,
        String(data.platform ?? ""),
        String(data.orderId ?? ""),
        JSON.stringify(data.items ?? []),
        Number(data.total ?? 0),
        JSON.stringify(data)
      );
  }

  getRecentOrders(userId: string, limit = 5): Row[] {
    return this.db
      .prepare(
        `SELECT platform, order_id, items, total, status, created_at
         FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
      )
      .all(userId, limit) as Row[];
  }

  // ── Reminders ─────────────────────────────────────────────

  saveReminder(userId: string, message: string, fireAt: Date, cron?: string): number {
    this.ensureUser(userId);
    const result = this.db
      .prepare(
        `INSERT INTO reminders (user_id, message, fire_at, cron) VALUES (?, ?, ?, ?)`
      )
      .run(userId, message, Math.floor(fireAt.getTime() / 1000), cron ?? null) as {
      lastInsertRowid: number;
    };
    return result.lastInsertRowid;
  }

  getPendingReminders(): Array<{ id: number; userId: string; message: string; fireAt: number }> {
    const now = Math.floor(Date.now() / 1000);
    return (
      this.db
        .prepare(
          `SELECT id, user_id as userId, message, fire_at as fireAt
           FROM reminders WHERE fire_at <= ? AND fired = 0`
        )
        .all(now) as Row[]
    ).map((r) => ({
      id: Number(r.id),
      userId: String(r.userId),
      message: String(r.message),
      fireAt: Number(r.fireAt),
    }));
  }

  markReminderFired(id: number): void {
    this.db.prepare(`UPDATE reminders SET fired = 1 WHERE id = ?`).run(id);
  }

  getUserReminders(userId: string): Array<{ id: number; message: string; fireAt: number }> {
    return (
      this.db
        .prepare(
          `SELECT id, message, fire_at as fireAt FROM reminders
           WHERE user_id = ? AND fired = 0 ORDER BY fire_at ASC`
        )
        .all(userId) as Row[]
    ).map((r) => ({ id: Number(r.id), message: String(r.message), fireAt: Number(r.fireAt) }));
  }

  deleteReminder(userId: string, id: number): boolean {
    const result = this.db
      .prepare(`DELETE FROM reminders WHERE id = ? AND user_id = ?`)
      .run(id, userId) as { changes: number };
    return result.changes > 0;
  }

  // ── Memory management ─────────────────────────────────────

  clearConversationHistory(userId: string): boolean {
    try {
      const result = this.db
        .prepare(`DELETE FROM conversations WHERE user_id = ?`)
        .run(userId) as { changes: number };
      return result.changes > 0;
    } catch {
      return false;
    }
  }

  clearMemories(userId: string): boolean {
    try {
      const result = this.db
        .prepare(`DELETE FROM memories WHERE user_id = ?`)
        .run(userId) as { changes: number };
      return result.changes > 0;
    } catch {
      return false;
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  private ensureUser(userId: string): void {
    this.db.prepare(`INSERT OR IGNORE INTO users (id) VALUES (?)`).run(userId);
  }
}
