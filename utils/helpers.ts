/**
 * Shared utility functions used across the codebase.
 */

import * as fs from "fs";
import * as path from "path";

/** Sleep for `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry an async operation up to `attempts` times with exponential backoff. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 1000
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await sleep(baseDelayMs * Math.pow(2, i));
    }
  }
  throw new Error("Unreachable");
}

/** Sanitise user input: strip leading/trailing whitespace, normalise spaces. */
export function sanitise(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

/** Extract a numeric price from a string like "₹299" or "Rs. 1,299". */
export function parsePrice(raw: string): number {
  const cleaned = raw.replace(/[₹Rs.,\s]/gi, "");
  return parseInt(cleaned, 10) || 0;
}

/** Format ₹ amount for display. */
export function formatPrice(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

/** Truncate a string to `maxLen` chars with ellipsis. */
export function truncate(str: string, maxLen = 100): string {
  return str.length > maxLen ? `${str.slice(0, maxLen)}…` : str;
}

/** Check if a string looks like an OTP (4–8 digit number). */
export function isOTP(input: string): boolean {
  return /^\d{4,8}$/.test(input.trim());
}

/** Pick a random element from an array. */
export function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Ensure a directory exists, creating it recursively if necessary. */
export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/** Generate a unique temp file path. */
export function tmpFile(prefix: string, ext = "png"): string {
  const tmpDir = path.join(process.cwd(), "tmp");
  ensureDir(tmpDir);
  return path.join(tmpDir, `${prefix}-${Date.now()}.${ext}`);
}

/** Safely delete a file, ignoring errors. */
export function safeDelete(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

/** Deep clone a plain object via JSON round-trip. */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/** Build a simple "X ago" relative time string. */
export function timeAgo(dateMs: number): string {
  const diff = Date.now() - dateMs;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/** Escape Markdown special chars for Telegram MarkdownV2. */
export function escapeMd(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}
