/**
 * Telegram Sender — wraps Telegraf context to send messages, photos, and documents
 * with robust error handling and Markdown safety checks.
 *
 * Returns the Telegram message_id so the caller can track it for future edits
 * (used by SkillContext.updateMessage to show progress updates).
 */

import { Context } from "telegraf";
import { Message } from "telegraf/types";
import * as fs from "fs";
import { logger } from "../../utils/logger";

const MAX_MSG_LENGTH = 4096;

function isMarkdownSafe(text: string): boolean {
  const asterisks   = (text.match(/\*/g)   ?? []).length;
  const underscores = (text.match(/_/g)    ?? []).length;
  const backticks   = (text.match(/`/g)    ?? []).length;
  return asterisks % 2 === 0 && underscores % 2 === 0 && backticks % 2 === 0;
}

/**
 * Send a message. Returns the Telegram message_id on success, undefined on failure.
 * @param forceMarkdown Pass true when the caller guarantees the text is valid Markdown.
 */
export async function sendMessage(
  ctx: Context,
  text: string,
  forceMarkdown = false
): Promise<number | undefined> {
  if (!text) return undefined;

  const useMarkdown = forceMarkdown || isMarkdownSafe(text);

  try {
    const chunks = splitText(text, MAX_MSG_LENGTH);
    let lastMsgId: number | undefined;

    for (const chunk of chunks) {
      let sent: Message.TextMessage;
      if (useMarkdown) {
        sent = await ctx.reply(chunk, { parse_mode: "Markdown" });
      } else {
        sent = await ctx.reply(stripMarkdown(chunk));
      }
      lastMsgId = sent.message_id;
    }

    return lastMsgId;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error(`sendMessage failed (markdown=${useMarkdown}): ${errMsg}`);

    if (useMarkdown) {
      try {
        const sent = await ctx.reply(stripMarkdown(text));
        return sent.message_id;
      } catch (e: unknown) {
        logger.error("sendMessage plain-text fallback also failed:", e);
      }
    }
    return undefined;
  }
}

/** Send an error message — always plain text. */
export async function sendError(ctx: Context, text: string): Promise<void> {
  const safe = stripMarkdown(text).slice(0, MAX_MSG_LENGTH);
  await ctx.reply(safe).catch((e: unknown) => {
    logger.error("sendError failed:", e);
  });
}

/** Send a photo/image file. */
export async function sendPhoto(
  ctx: Context,
  filePath: string,
  caption?: string
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    logger.warn(`Photo not found: ${filePath}`);
    return;
  }
  try {
    const safeCaption = caption ? stripMarkdown(caption).slice(0, 1024) : undefined;
    await ctx.replyWithPhoto(
      { source: fs.createReadStream(filePath) },
      safeCaption ? { caption: safeCaption } : {}
    );
  } catch (err) {
    logger.error("sendPhoto failed:", err);
  }
}

/**
 * Send any file as a Telegram document.
 * Used by skills that output files (audio clips, PDFs, ZIPs, etc.).
 */
export async function sendDocument(
  ctx: Context,
  filePath: string,
  caption?: string
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    logger.warn(`Document not found: ${filePath}`);
    return;
  }
  try {
    const safeCaption = caption ? stripMarkdown(caption).slice(0, 1024) : undefined;
    await ctx.replyWithDocument(
      { source: fs.createReadStream(filePath), filename: filePath.split(/[\\/]/).pop() },
      safeCaption ? { caption: safeCaption } : {}
    );
  } catch (err) {
    logger.error("sendDocument failed:", err);
    // Fallback: try sendMessage with just the path
    await sendError(ctx, `File ready at: ${filePath}`);
  }
}

/** Send typing indicator. */
export async function sendTyping(ctx: Context): Promise<void> {
  await ctx.sendChatAction("typing").catch(() => {});
}

// ── Helpers ─────────────────────────────────────────────────────────

function splitText(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    const split = remaining.lastIndexOf("\n\n", maxLen);
    const cutAt = split > 0 ? split : maxLen;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[_*`[\]]/g, "");
}

export const MARKDOWN_RISK_RE = /[*_`[\]()~>#+\-=|{}.!]/;
