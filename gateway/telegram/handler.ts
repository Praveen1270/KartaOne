/**
 * Telegram message handler.
 *
 * Enhancements over the original:
 * - Downloads any files/photos/audio/video the user sends
 * - Builds a full SkillContext (not just AgentContext)
 * - askUser(): pauses skill execution until user replies
 * - updateMessage(): edits the last bot message for progress updates
 * - sendFile/sendDocument support for skills that output files
 */

import { Context, Telegraf } from "telegraf";
import { Agent } from "../../core/agent";
import { MemoryStore } from "../../memory/store";
import { SkillContext, UploadedFile } from "../../core/skill-base";
import { sendMessage, sendError, sendPhoto, sendDocument, sendTyping } from "./sender";
import { downloadTelegramFile } from "../../utils/files";
import { logger } from "../../utils/logger";

// ── Persistent state across message calls ──────────────────────────
// When a skill calls askUser(), the handler pauses and waits for the
// user's next message before resolving the promise.
const pendingReplies = new Map<string, (answer: string) => void>();

// Track the last bot message ID per user for updateMessage() edits
const lastBotMsgId = new Map<string, number>();

export function createHandler(agent: Agent, memory: MemoryStore) {
  return async (ctx: Context): Promise<void> => {
    const userId = ctx.from?.id.toString();
    if (!userId) return;

    const message = extractText(ctx);
    const files = await extractFiles(ctx, userId);

    // If no text and no files, ignore the update
    if (!message && files.length === 0) return;

    const effectiveMessage = message || `[User sent ${files.length} file(s)]`;
    logger.info(`[TG] ${userId}: ${effectiveMessage.slice(0, 80)}`);

    // ── Check for pending askUser() reply ──────────────────
    if (message && pendingReplies.has(userId)) {
      const resolve = pendingReplies.get(userId)!;
      pendingReplies.delete(userId);
      resolve(message);
      return;
    }

    await sendTyping(ctx);

    // ── Build SkillContext ─────────────────────────────────
    const profile = await memory.getProfile(userId);

    const skillCtx: SkillContext = {
      userId,
      message: effectiveMessage,
      files,
      profile: {
        name: profile.name,
        phone: profile.phone,
        address: profile.address,
        language: profile.language,
        preferences: profile.preferences,
      },
      memory: memory.getMemories(userId),
      history: memory.getHistory(userId) as import("../../core/skill-base").Message[],

      reply: async (text: string) => {
        const sent = await sendMessage(ctx, text, true);
        if (sent) lastBotMsgId.set(userId, sent);
      },

      replyWithFile: async (filePath: string, caption?: string) => {
        await sendDocument(ctx, filePath, caption);
      },

      replyWithPhoto: async (filePath: string, caption?: string) => {
        await sendPhoto(ctx, filePath, caption);
      },

      askUser: async (question: string): Promise<string> => {
        // Send the question and wait for the user's next message
        const sent = await sendMessage(ctx, question, true);
        if (sent) lastBotMsgId.set(userId, sent);

        return new Promise<string>((resolve) => {
          pendingReplies.set(userId, resolve);
          // Auto-resolve after 5 minutes to prevent stuck skills
          setTimeout(() => {
            if (pendingReplies.has(userId)) {
              pendingReplies.delete(userId);
              resolve("[no response — timed out]");
            }
          }, 5 * 60 * 1000);
        });
      },

      updateMessage: async (text: string) => {
        const msgId = lastBotMsgId.get(userId);
        if (msgId && ctx.chat) {
          try {
            await ctx.telegram.editMessageText(
              ctx.chat.id,
              msgId,
              undefined,
              text,
              { parse_mode: "Markdown" }
            );
          } catch {
            // Message too old, or unchanged — send fresh one
            const sent = await sendMessage(ctx, text, true);
            if (sent) lastBotMsgId.set(userId, sent);
          }
        } else {
          const sent = await sendMessage(ctx, text, true);
          if (sent) lastBotMsgId.set(userId, sent);
        }
      },
    };

    try {
      await agent.handle(userId, effectiveMessage, skillCtx);
    } catch (err) {
      logger.error("Agent error:", err);
      await sendError(ctx, "❌ Something went wrong. Please try again in a moment.");
    }
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Extract text from any message type. */
function extractText(ctx: Context): string {
  if (!ctx.message) return "";
  if ("text" in ctx.message) return ctx.message.text;
  if ("caption" in ctx.message && ctx.message.caption) return ctx.message.caption;
  return "";
}

/** Download any attached files from Telegram and return UploadedFile[]. */
async function extractFiles(ctx: Context, userId: string): Promise<UploadedFile[]> {
  const files: UploadedFile[] = [];
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !ctx.message) return files;

  try {
    // Document (PDF, ZIP, any file)
    if ("document" in ctx.message && ctx.message.document) {
      const doc = ctx.message.document;
      const fileName = doc.file_name ?? `file_${doc.file_id}`;
      const filePath = await downloadTelegramFile(token, doc.file_id, fileName);
      files.push({
        fileName,
        path: filePath,
        mimeType: doc.mime_type ?? "application/octet-stream",
        size: doc.file_size ?? 0,
      });
    }

    // Photo (highest resolution)
    if ("photo" in ctx.message && ctx.message.photo?.length) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1]!;
      const fileName = `photo_${Date.now()}.jpg`;
      const filePath = await downloadTelegramFile(token, photo.file_id, fileName);
      files.push({
        fileName,
        path: filePath,
        mimeType: "image/jpeg",
        size: photo.file_size ?? 0,
      });
    }

    // Audio / voice
    if ("audio" in ctx.message && ctx.message.audio) {
      const audio = ctx.message.audio;
      const fileName = audio.file_name ?? `audio_${Date.now()}.mp3`;
      const filePath = await downloadTelegramFile(token, audio.file_id, fileName);
      files.push({
        fileName,
        path: filePath,
        mimeType: audio.mime_type ?? "audio/mpeg",
        size: audio.file_size ?? 0,
      });
    }

    if ("voice" in ctx.message && ctx.message.voice) {
      const voice = ctx.message.voice;
      const fileName = `voice_${Date.now()}.ogg`;
      const filePath = await downloadTelegramFile(token, voice.file_id, fileName);
      files.push({
        fileName,
        path: filePath,
        mimeType: "audio/ogg",
        size: voice.file_size ?? 0,
      });
    }

    // Video
    if ("video" in ctx.message && ctx.message.video) {
      const video = ctx.message.video;
      const fileName = video.file_name ?? `video_${Date.now()}.mp4`;
      const filePath = await downloadTelegramFile(token, video.file_id, fileName);
      files.push({
        fileName,
        path: filePath,
        mimeType: video.mime_type ?? "video/mp4",
        size: video.file_size ?? 0,
      });
    }
  } catch (err) {
    logger.error(`[${userId}] Failed to download file:`, err);
  }

  return files;
}

/** Expose for bot.ts to register on all update types. */
export function createFileHandler(agent: Agent, memory: MemoryStore) {
  return createHandler(agent, memory);
}
