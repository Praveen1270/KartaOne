/**
 * Shop skill — triggers the universal COD shopping plugin.
 * Handles Amazon, Flipkart, Meesho, and any other COD-enabled Indian e-commerce site.
 */

import { SkillBase, SkillContext, SkillResult, SkillManifest } from "../../../core/skill-base";
import { UniversalShopPlugin } from "../../../plugins/universal-shop/plugin";
import { logger } from "../../../utils/logger";

export default class ShopSkill extends SkillBase {
  manifest: SkillManifest = {
    name: "shop",
    displayName: "COD Shopping",
    version: "1.0.0",
    description: "Buy products from Amazon, Flipkart, Meesho with Cash on Delivery",
    triggers: [
      "buy", "shop", "purchase", "order", "amazon", "flipkart", "meesho",
      "cod", "cash on delivery", "खरीदो", "shopping", "product",
      "earphones", "shoes", "clothes", "electronics",
    ],
    capabilities: ["shopping", "browser-automation", "cod-payment"],
    requiredEnvVars: [],
    npmDependencies: {},
    isBuiltin: true,
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    useCount: 0,
    author: "builtin",
    testStatus: "passed",
  };

  private plugin = new UniversalShopPlugin();

  async execute(input: string, context: SkillContext): Promise<SkillResult> {
    logger.info(`Shop skill: "${input.slice(0, 60)}"`);

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
