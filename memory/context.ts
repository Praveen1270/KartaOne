/**
 * Context builders.
 * buildContext() builds the legacy AgentContext for existing plugins.
 * buildSkillContext() is a convenience wrapper — the Telegram handler
 * builds SkillContext directly so it can wire in askUser/updateMessage.
 */

import { MemoryStore } from "./store";
import { AgentContext } from "../core/plugin-base";
import { SkillContext, UploadedFile } from "../core/skill-base";

export function buildContext(
  userId: string,
  userMessage: string,
  memory: MemoryStore,
  sendMessage: (msg: string) => Promise<void>,
  sendPhoto: (filePath: string, caption?: string) => Promise<void>
): AgentContext {
  const profile = memory.getProfile(userId);
  return {
    userId,
    userMessage,
    conversationHistory: memory.getHistory(userId),
    userProfile: profile,
    memory: memory.getMemories(userId),
    sendMessage,
    sendPhoto,
  };
}

/**
 * Build a minimal SkillContext for testing or non-Telegram callers.
 * For production Telegram use the handler builds SkillContext directly
 * so it can attach the real askUser/updateMessage implementations.
 */
export function buildSkillContext(
  userId: string,
  message: string,
  memory: MemoryStore,
  files: UploadedFile[],
  reply: (text: string) => Promise<void>,
  replyWithFile: (path: string, caption?: string) => Promise<void>,
  replyWithPhoto: (path: string, caption?: string) => Promise<void>,
  askUser: (question: string) => Promise<string>,
  updateMessage: (text: string) => Promise<void>
): SkillContext {
  const profile = memory.getProfile(userId);
  return {
    userId,
    message,
    files,
    profile: {
      name: profile.name,
      phone: profile.phone,
      address: profile.address,
      language: profile.language,
      preferences: profile.preferences,
    },
    memory: memory.getMemories(userId),
    history: memory.getHistory(userId) as import("../core/skill-base").Message[],
    reply,
    replyWithFile,
    replyWithPhoto,
    askUser,
    updateMessage,
  };
}
