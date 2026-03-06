/**
 * Main agent loop: Route → Execute → Self-Improve → Respond.
 *
 * Priority order for every incoming message:
 *   1. Resume an active multi-turn flow (OTP, order confirmation, etc.)
 *   2. Match a learned skill (user-specific capabilities built at runtime)
 *   3. Match a builtin skill (self-improve meta-skill)
 *   4. Plan & execute via the existing plugin system (Zomato, Swiggy, Shop, Search, Reminders)
 *   5. No plugin matched → trigger SelfImprover to write a new skill
 *   6. If self-improvement fails → fallback to LLM chat
 */

import { LLM } from "./llm";
import { Planner, ExecutionPlan } from "./planner";
import { PluginRegistry } from "./plugin-registry";
import { SkillRegistry } from "./skill-registry";
import { SelfImprover } from "./self-improver";
import { SandboxExecutor } from "../sandbox/executor";
import { MemoryStore } from "../memory/store";
import { AgentContext, PluginResult } from "./plugin-base";
import { SkillContext } from "./skill-base";
import { logger } from "../utils/logger";
import { BrowserEngine } from "../browser/engine";

interface ActiveFlow {
  plugin: string;
  state: Record<string, unknown>;
  awaitingInput: "confirmation" | "otp" | "order_confirmation" | "purchase_confirmation" | "input";
  plan?: ExecutionPlan;
}

const activeFlows = new Map<string, ActiveFlow>();

export class Agent {
  private executor = new SandboxExecutor();

  constructor(
    private llm: LLM,
    private planner: Planner,
    private plugins: PluginRegistry,
    private skills: SkillRegistry,
    private improver: SelfImprover,
    private memory: MemoryStore
  ) {}

  async handle(
    userId: string,
    message: string,
    ctx: SkillContext
  ): Promise<void> {
    logger.info(`[${userId}] ← ${message.slice(0, 80)}`);

    // ── 1. Resume active multi-turn flow ────────────────────
    const activeFlow = activeFlows.get(userId);
    if (activeFlow) {
      await this.continueFlow(userId, message, activeFlow, ctx);
      return;
    }

    // ── 2. Try learned skills first ─────────────────────────
    const learnedSkill = this.skills.route(message);
    if (learnedSkill) {
      logger.info(`Dispatching to skill: ${learnedSkill.manifest.name}`);
      const result = await this.executor.run(learnedSkill, message, ctx);

      if (result.output) await ctx.reply(result.output);
      if (result.files?.length) {
        for (const filePath of result.files) {
          await ctx.replyWithFile(filePath);
        }
      }

      await this.memory.saveConversation(userId, message, result.output);
      return;
    }

    // ── 3. Try existing plugin system ────────────────────────
    const pluginMatched = this.plugins
      .all()
      .filter((p) => p.name !== "chat")
      .some((p) => p.canHandle(message));

    if (pluginMatched) {
      const userProfile = await this.memory.getProfile(userId);
      const plan = await this.planner.plan(message, {
        name: userProfile.name,
        city: userProfile.address.city,
        phone: userProfile.phone,
      });

      if (plan.requiresConfirmation && plan.confirmationMessage) {
        activeFlows.set(userId, {
          plugin: plan.steps[0]?.plugin ?? "chat",
          state: { plan },
          awaitingInput: "confirmation",
          plan,
        });

        const stepList = plan.steps
          .map((s, i) => `${i + 1}. ${s.description}`)
          .join("\n");

        await ctx.reply(
          `📋 *Here's what I'll do:*\n\n${stepList}\n\n` +
            `⏱ Estimated time: ${plan.estimatedTime}\n\n` +
            `${plan.confirmationMessage}\n\n` +
            `Reply *YES* to proceed or *NO* to cancel`
        );
        return;
      }

      await this.executePlan(userId, plan, ctx);
      return;
    }

    // ── 4. Nothing matched → self-improve or chat fallback ──
    // Only attempt self-improvement when:
    //   a) ANTHROPIC_API_KEY is available (SelfImprover requires Claude)
    //   b) The message looks like a genuine new-capability request
    const canSelfImprove =
      !!process.env.ANTHROPIC_API_KEY && this.isNewCapabilityRequest(message);

    if (canSelfImprove) {
      logger.info(`No skill/plugin for: "${message.slice(0, 60)}" — triggering self-improvement`);

      const result = await this.improver.createSkill(message, {
        reply: ctx.reply,
        updateMessage: ctx.updateMessage,
      });

      if (result.success && result.skillName) {
        await this.skills.hotLoad(result.skillName);
        const newSkill = this.skills.get(result.skillName);

        if (newSkill) {
          const execResult = await this.executor.run(newSkill, message, ctx);
          if (execResult.output) await ctx.reply(execResult.output);
          if (execResult.files?.length) {
            for (const filePath of execResult.files) {
              await ctx.replyWithFile(filePath);
            }
          }
          await this.memory.saveConversation(userId, message, execResult.output);
        }
        return;
      }
      logger.warn(`Self-improvement failed: ${result.error}`);
    }

    // ── 5. Chat fallback (LLM conversation) ─────────────────
    logger.info(`Chat fallback for: "${message.slice(0, 60)}"`);
    const chatSkill = this.skills.get("chat");
    if (chatSkill) {
      const execResult = await this.executor.run(chatSkill, message, ctx);
      if (execResult.output) await ctx.reply(execResult.output);
      await this.memory.saveConversation(userId, message, execResult.output);
    }
  }

  private async continueFlow(
    userId: string,
    message: string,
    flow: ActiveFlow,
    ctx: SkillContext
  ): Promise<void> {
    const lower = message.toLowerCase().trim();
    const YES_WORDS = ["yes", "y", "haan", "ha", "हां", "ok", "sure", "confirm", "book it", "place it", "go ahead", "proceed"];
    const NO_WORDS  = ["no", "n", "nahi", "cancel", "stop", "nope", "नहीं"];

    switch (flow.awaitingInput) {
      case "confirmation": {
        if (YES_WORDS.some((w) => lower === w || lower.startsWith(w))) {
          activeFlows.delete(userId);
          if (flow.plan) await this.executePlan(userId, flow.plan, ctx);
        } else {
          activeFlows.delete(userId);
          await ctx.reply("❌ Cancelled. Let me know when you're ready!");
        }
        break;
      }

      case "otp": {
        const plugin = this.plugins.get(flow.plugin);
        if (plugin && "submitOTP" in plugin) {
          const ok = await (plugin as unknown as {
            submitOTP: (otp: string, ctx: AgentContext) => Promise<boolean>;
          }).submitOTP(message.trim(), this.toAgentContext(ctx));
          if (ok) {
            await ctx.reply("✅ OTP verified! Continuing your order...");
            activeFlows.delete(userId);
          } else {
            await ctx.reply("❌ Invalid OTP. Please try again:");
          }
        }
        break;
      }

      case "order_confirmation":
      case "purchase_confirmation": {
        if (YES_WORDS.some((w) => lower === w || lower.startsWith(w))) {
          activeFlows.delete(userId);
          const plugin = this.plugins.get(flow.plugin);
          if (plugin && "confirmAndPlace" in plugin) {
            const browserEngine = BrowserEngine.getInstance();
            const page = await browserEngine.getPage();
            try {
              const result = await (plugin as unknown as {
                confirmAndPlace: (
                  page: unknown,
                  ctx: AgentContext,
                  state: Record<string, unknown>
                ) => Promise<PluginResult>;
              }).confirmAndPlace(page, this.toAgentContext(ctx), flow.state);
              await ctx.reply(result.output);
              if (result.success) {
                await this.memory.saveOrder(userId, result.data ?? {});
              }
            } finally {
              await page.close();
            }
          }
        } else if (NO_WORDS.some((w) => lower === w)) {
          activeFlows.delete(userId);
          await ctx.reply("❌ Order cancelled. Let me know when you want to try again!");
        } else {
          await ctx.reply("Please reply *YES* to confirm your order or *NO* to cancel.");
        }
        break;
      }

      default: {
        activeFlows.delete(userId);
        await this.handle(userId, message, ctx);
      }
    }
  }

  private async executePlan(
    userId: string,
    plan: ExecutionPlan,
    ctx: SkillContext
  ): Promise<void> {
    const agentCtx = this.toAgentContext(ctx);

    for (const step of plan.steps) {
      logger.info(`Executing step ${step.stepNumber}: ${step.plugin}.${step.action}`);

      const plugin = this.plugins.get(step.plugin);
      if (!plugin) {
        await ctx.reply(`⚠️ Plugin '${step.plugin}' not available.`);
        continue;
      }

      let result: PluginResult;
      try {
        result = await plugin.run(ctx.message, agentCtx);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Plugin ${step.plugin} threw:`, err);
        await ctx.reply(`❌ Error: ${msg}`);
        break;
      }

      if (result.output) {
        await ctx.reply(result.output);
      }

      if (result.requiresHumanInput) {
        const awaitingType: ActiveFlow["awaitingInput"] =
          (result.data as Record<string, unknown> | undefined)?.awaitingOTP === true
            ? "otp"
            : (result.data as Record<string, unknown> | undefined)?.awaitingConfirmation === true
              ? "order_confirmation"
              : "input";

        activeFlows.set(userId, {
          plugin: step.plugin,
          state: result.data ?? {},
          awaitingInput: awaitingType,
        });
        break;
      }

      await this.memory.saveConversation(userId, ctx.message, result.output);
    }
  }

  /**
   * Returns true only when the message looks like a request for a genuinely
   * new automation capability (not plain conversation or questions).
   * Prevents the self-improver from firing on every chat message.
   */
  private isNewCapabilityRequest(message: string): boolean {
    const lower = message.toLowerCase().trim();

    // Plain questions → chat
    if (/^(what|who|where|when|why|how|is|are|do|does|did|tell me|can you tell|explain)/.test(lower)) return false;
    // Greetings / pleasantries → chat
    if (/^(hi|hello|hey|thanks|thank you|ok|okay|bye|good morning|good evening|good night|namaste|haha|lol)/.test(lower)) return false;
    // Personal statements / memory updates → chat
    if (/^(my name|i am|i'm|call me|i live|my phone|remember|note that|i like|i prefer|i love|i hate|i use|i have|i work|i study)/.test(lower)) return false;
    // Short messages are almost never capability requests
    if (lower.split(/\s+/).length < 5) return false;

    // Capability request keywords
    const capabilityKeywords = [
      "build", "create a tool", "make a tool", "write a skill", "new skill",
      "automate", "script", "generate", "convert", "extract", "download",
      "scrape", "parse", "process", "analyze", "summarize from", "clip",
      "resize", "compress", "merge", "split", "combine",
    ];
    return capabilityKeywords.some((kw) => lower.includes(kw));
  }

  /** Bridge SkillContext → AgentContext for the existing plugin system. */
  private toAgentContext(ctx: SkillContext): AgentContext {
    return {
      userId: ctx.userId,
      userMessage: ctx.message,
      conversationHistory: ctx.history,
      userProfile: {
        name: ctx.profile.name,
        phone: ctx.profile.phone,
        address: ctx.profile.address,
        language: ctx.profile.language,
        preferences: ctx.profile.preferences,
      },
      memory: ctx.memory,
      sendMessage: ctx.reply,
      sendPhoto: ctx.replyWithPhoto,
    };
  }
}
