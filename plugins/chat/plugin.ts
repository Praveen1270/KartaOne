/**
 * Chat Plugin — LLM-powered conversational fallback.
 * Used when no other plugin matches the user's intent.
 * Maintains per-user conversation history for context.
 */

import { PluginBase, PluginResult, AgentContext } from "../../core/plugin-base";
import { LLM } from "../../core/llm";
import { logger } from "../../utils/logger";

const CHAT_SYSTEM_PROMPT = `You are Karta One, a Personal AI Assistant for India.

Your capabilities:
- Order food on Zomato and Swiggy (Cash on Delivery)
- Buy products from Amazon, Flipkart, Meesho (Cash on Delivery)
- Search the web for information
- Set reminders and alerts
- Build new skills on demand — if you don't know how to do something, say you can learn
- Answer any question

Personality:
- Helpful, friendly, and efficient
- Responds in the same language the user writes in (English or Hindi)
- Uses ₹ for prices, Indian format for dates/times
- Doesn't ask unnecessary clarifying questions — takes action
- When asked to do something you can do, just do it
- Keep responses concise — this is a Telegram chat`;

export class ChatPlugin extends PluginBase {
  name = "chat";
  description = "Karta One conversational fallback for questions and casual chat";
  triggers = []; // Matched last as fallback

  constructor(private llm: LLM) {
    super();
  }

  // Override canHandle — always returns false (matched only as explicit fallback)
  override canHandle(_input: string): boolean {
    return false;
  }

  async run(input: string, context: AgentContext): Promise<PluginResult> {
    logger.info(`Chat fallback for: "${input.slice(0, 60)}"`);

    const messages = [
      ...context.conversationHistory.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
      { role: "user" as const, content: input },
    ];

    try {
      const reply = await this.llm.chat(messages, CHAT_SYSTEM_PROMPT);
      return this.success(reply);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Chat LLM failed:", err);
      return this.error(`❌ AI response failed: ${msg}`);
    }
  }
}
