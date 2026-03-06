/**
 * Chat skill — LLM-powered conversational fallback.
 * Used when no other skill or plugin matches the user's intent.
 * Automatically extracts and persists facts the user mentions about themselves.
 */

import { SkillBase, SkillContext, SkillResult, SkillManifest } from "../../../core/skill-base";
import { LLM } from "../../../core/llm";
import { logger } from "../../../utils/logger";

function buildSystemPrompt(context: SkillContext): string {
  const lines: string[] = [];

  lines.push(`You are Karta One, a Personal AI Assistant for India.`);

  // Personalise with what we know about the user
  const name = context.profile.name && context.profile.name !== "User" ? context.profile.name : null;
  const city = context.profile.address?.city || null;
  const memories = context.memory;

  if (name || city || Object.keys(memories).length > 0) {
    lines.push(`\nWhat you know about this user:`);
    if (name) lines.push(`- Name: ${name}`);
    if (city) lines.push(`- City: ${city}`);
    for (const [key, value] of Object.entries(memories)) {
      lines.push(`- ${key}: ${value}`);
    }
  }

  lines.push(`
Your capabilities:
- Order food on Zomato and Swiggy (Cash on Delivery)
- Buy products from Amazon, Flipkart, Meesho (Cash on Delivery)
- Search the web for real-time information
- Set reminders and alerts
- Answer any question

Personality:
- Helpful, friendly, and proactively use the user's name when you know it
- Responds in the same language as the user (English or Hindi)
- Uses ₹ for prices, Indian date/time format
- Keep responses concise — this is a Telegram chat
- When the user mentions something personal (name, city, preference, job, etc.), acknowledge it naturally

IMPORTANT: If the user tells you something about themselves (name, location, preferences, etc.), acknowledge it and remember it. Never ask for information you already know.`);

  return lines.join("\n");
}

/** Extract personal facts from a user message using a lightweight LLM call. */
async function extractFacts(
  llm: LLM,
  userMessage: string
): Promise<Record<string, string>> {
  const lower = userMessage.toLowerCase();
  // Only run extraction if the message likely contains personal info
  const triggers = ["my name", "i am", "i'm", "call me", "i live", "i work",
    "i study", "my job", "my city", "my phone", "i like", "i prefer",
    "i love", "i hate", "i use", "remember", "note that", "i have", "i'm from"];
  if (!triggers.some((t) => lower.includes(t))) return {};

  try {
    const prompt = `Extract personal facts from this message and return ONLY a JSON object.
Keys should be short snake_case (e.g. "name", "city", "job", "food_preference").
Values should be concise strings.
Return {} if there are no clear personal facts.
Return ONLY the raw JSON — no explanation, no markdown.

Message: "${userMessage}"`;

    const raw = await llm.chat([{ role: "user", content: prompt }]);
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```\s*$/, "").trim();
    return JSON.parse(cleaned) as Record<string, string>;
  } catch {
    return {};
  }
}

export default class ChatSkill extends SkillBase {
  manifest: SkillManifest = {
    name: "chat",
    displayName: "Chat & Conversation",
    version: "1.0.0",
    description: "LLM-powered conversational fallback for questions and casual chat",
    triggers: [],
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

  override canHandle(_input: string): boolean {
    return false;
  }

  async execute(input: string, context: SkillContext): Promise<SkillResult> {
    logger.info(`Chat: "${input.slice(0, 60)}"`);

    const systemPrompt = buildSystemPrompt(context);

    const messages = [
      ...context.history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: input },
    ];

    try {
      const reply = await this.llm.chat(messages, systemPrompt);

      // Extract and persist any personal facts the user mentioned
      extractFacts(this.llm, input)
        .then(async (facts) => {
          for (const [key, value] of Object.entries(facts)) {
            if (value && value.trim()) {
              await context.saveMemory(key, value.trim());
              // Also update profile fields if they match known profile keys
              if (key === "name") await context.updateProfile({ name: value.trim() });
              if (key === "city") await context.updateProfile({ address: { ...context.profile.address, city: value.trim() } });
              if (key === "phone") await context.updateProfile({ phone: value.trim() });
            }
          }
        })
        .catch((err) => logger.warn("Memory extraction failed:", err));

      return this.ok(reply);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Chat LLM failed:", err);
      return this.fail(`AI response failed: ${msg}`);
    }
  }
}
