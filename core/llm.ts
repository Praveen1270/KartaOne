/**
 * Multi-LLM factory.
 * Supports Claude (Anthropic), GPT-4o (OpenAI), Gemini (Google), and Groq (Llama).
 * Provider is selected via LLM_PROVIDER env var set during setup.
 *
 * Resilience:
 * - Gemini 429 (quota) → exponential backoff, up to 3 retries
 * - Any provider failure → returns FALLBACK_MESSAGE instead of throwing
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../utils/logger";
import { sleep } from "../utils/helpers";

export type LLMProvider = "claude" | "openai" | "gemini" | "groq";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const FALLBACK_MESSAGE =
  "⚠️ AI service is temporarily unavailable. Please try again in a moment.";

const GEMINI_RETRY_ATTEMPTS = 3;
const GEMINI_BASE_DELAY_MS  = 2000; // 2 s → 4 s → 8 s

/** Returns true when the error is a Gemini 429 rate-limit response. */
function isGemini429(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("429") || msg.includes("quota") || msg.includes("rate");
  }
  return false;
}

export class LLM {
  private provider: LLMProvider;

  constructor() {
    this.provider = (process.env.LLM_PROVIDER ?? "claude") as LLMProvider;
    logger.info(`LLM provider: ${this.provider}`);
  }

  /**
   * Send a chat request to the configured LLM.
   * Never throws — returns FALLBACK_MESSAGE on any unrecoverable error so the
   * bot keeps running.
   */
  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    try {
      switch (this.provider) {
        case "claude":
          return await this.callClaude(messages, systemPrompt);
        case "openai":
          return await this.callOpenAI(messages, systemPrompt);
        case "gemini":
          return await this.callGeminiWithRetry(messages, systemPrompt);
        case "groq":
          return await this.callGroq(messages, systemPrompt);
        default:
          return await this.callClaude(messages, systemPrompt);
      }
    } catch (err) {
      logger.error("LLM call failed after all retries:", err);
      return FALLBACK_MESSAGE;
    }
  }

  // ── Gemini with retry ────────────────────────────────────

  private async callGeminiWithRetry(
    messages: ChatMessage[],
    systemPrompt?: string
  ): Promise<string> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= GEMINI_RETRY_ATTEMPTS; attempt++) {
      try {
        return await this.callGemini(messages, systemPrompt);
      } catch (err) {
        lastError = err;

        if (isGemini429(err)) {
          const delayMs = GEMINI_BASE_DELAY_MS * Math.pow(2, attempt - 1);
          logger.warn(
            `Gemini 429 quota exceeded — attempt ${attempt}/${GEMINI_RETRY_ATTEMPTS}, ` +
            `retrying in ${delayMs}ms`
          );
          await sleep(delayMs);
        } else {
          // Non-recoverable error — don't retry
          throw err;
        }
      }
    }

    logger.error(`Gemini failed after ${GEMINI_RETRY_ATTEMPTS} retries`);
    throw lastError;
  }

  // ── Provider implementations ─────────────────────────────

  private async callClaude(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const userMessages = messages.filter((m) => m.role !== "system");

    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2048,
      system: systemPrompt,
      messages: userMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    return (response.content[0] as { type: string; text: string }).text;
  }

  private async callOpenAI(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const allMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (systemPrompt) {
      allMessages.push({ role: "system", content: systemPrompt });
    }
    allMessages.push(
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }))
    );

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 2048,
      messages: allMessages,
    });

    return response.choices[0].message.content ?? "";
  }

  private async callGemini(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: systemPrompt,
    });

    // Gemini requires history to start with a "user" turn — drop any leading assistant messages
    const history = messages
      .slice(0, -1)
      .filter((m, i) => !(i === 0 && m.role === "assistant"))
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const chat = model.startChat({ history });

    const lastMessage = messages[messages.length - 1];
    const result = await chat.sendMessage(lastMessage?.content ?? "");

    return result.response.text();
  }

  private async callGroq(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    // Use the OpenAI SDK pointed at Groq's OpenAI-compatible endpoint
    const client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: "https://api.groq.com/openai/v1",
    });

    const allMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (systemPrompt) {
      allMessages.push({ role: "system", content: systemPrompt });
    }
    allMessages.push(
      ...messages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }))
    );

    const response = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_tokens: 2048,
      messages: allMessages,
    });

    return response.choices[0].message.content ?? "";
  }
}
