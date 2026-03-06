/**
 * Chat skill — LLM-powered conversational fallback.
 * Used when no other skill or plugin matches the user's intent.
 */

import { SkillBase, SkillContext, SkillResult, SkillManifest } from "../../../core/skill-base";
import { LLM } from "../../../core/llm";
import { logger } from "../../../utils/logger";

const CHAT_SYSTEM_PROMPT = `You are Karta One, a Personal AI Assistant for India.

Your capabilities:
- Order food on Zomato and Swiggy (Cash on Delivery)
- Buy products from Amazon, Flipkart, Meesho (Cash on Delivery)
- Search the web for real-time information
- Set reminders and alerts
- Write new skills for capabilities you don't have yet
- Answer any question

Personality:
- Helpful, friendly, and efficient
- Responds in the same language as the user (English or Hindi)
- Uses ₹ for prices, Indian date/time format
- Keep responses concise — this is a Telegram chat
- When asked about your skills, mention you can learn new ones on demand

If the user asks you to do something complex that needs a new skill, say you can build it.`;

export default class ChatSkill extends SkillBase {
  manifest: SkillManifest = {
    name: "chat",
    displayName: "Chat & Conversation",
    version: "1.0.0",
    description: "LLM-powered conversational fallback for questions and casual chat",
    triggers: [], // Never matched by keyword — only used as explicit fallback
    capabilities: ["conversation", "qa"],
    requiredEnvVars: [],
    npmDependencies: {},
    isBuiltin: true,
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    useCount: 0,
    author: "builtin",
    testStatus: "passed",
  };

  private llm = new LLM();

  // Never matches by trigger — only called explicitly as fallback
  override canHandle(_input: string): boolean {
    return false;
  }

  async execute(input: string, context: SkillContext): Promise<SkillResult> {
    logger.info(`Chat fallback: "${input.slice(0, 60)}"`);

    const messages = [
      ...context.history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: input },
    ];

    try {
      const reply = await this.llm.chat(messages, CHAT_SYSTEM_PROMPT);
      return this.ok(reply);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Chat LLM failed:", err);
      return this.fail(`AI response failed: ${msg}`);
    }
  }
}
