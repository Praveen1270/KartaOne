/**
 * Zomato skill — triggers the existing Zomato plugin flow.
 * The multi-turn OTP/confirmation flow is managed by the agent's activeFlows system.
 */

import { SkillBase, SkillContext, SkillResult, SkillManifest } from "../../../core/skill-base";
import { ZomatoPlugin } from "../../../plugins/zomato/plugin";
import { logger } from "../../../utils/logger";

export default class ZomatoSkill extends SkillBase {
  manifest: SkillManifest = {
    name: "zomato",
    displayName: "Zomato Food Ordering",
    version: "1.0.0",
    description: "Order food from Zomato using Cash on Delivery via browser automation",
    triggers: [
      "zomato", "food", "order food", "biryani", "pizza", "burger",
      "dinner", "lunch", "breakfast", "khana", "खाना", "order",
    ],
    capabilities: ["food-ordering", "browser-automation", "cod-payment"],
    requiredEnvVars: ["ZOMATO_PHONE"],
    npmDependencies: {},
    isBuiltin: true,
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    useCount: 0,
    author: "builtin",
    testStatus: "passed",
  };

  private plugin = new ZomatoPlugin();

  async execute(input: string, context: SkillContext): Promise<SkillResult> {
    logger.info(`Zomato skill: "${input.slice(0, 60)}"`);

    const agentCtx = {
      userId: context.userId,
      userMessage: context.message,
      conversationHistory: context.history,
      userProfile: {
        name: context.profile.name,
        phone: context.profile.phone,
        address: context.profile.address,
        language: context.profile.language,
        preferences: context.profile.preferences,
      },
      memory: context.memory,
      sendMessage: context.reply,
      sendPhoto: context.replyWithPhoto,
    };

    const result = await this.plugin.run(input, agentCtx);
    return {
      success: result.success,
      output: result.output,
      data: result.data,
      needsFollowUp: result.requiresHumanInput,
    };
  }
}
