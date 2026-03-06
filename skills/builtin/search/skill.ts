/**
 * Search skill — wraps the existing SearchPlugin for the skill system.
 */

import { SkillBase, SkillContext, SkillResult, SkillManifest } from "../../../core/skill-base";
import { SearchPlugin } from "../../../plugins/search/plugin";
import { logger } from "../../../utils/logger";

export default class SearchSkill extends SkillBase {
  manifest: SkillManifest = {
    name: "search",
    displayName: "Web Search",
    version: "1.0.0",
    description: "Real-time web search using Tavily API",
    triggers: [
      "search", "find", "look up", "what is", "who is", "how much",
      "price of", "news", "latest", "today's", "current", "nifty",
      "sensex", "weather", "stock", "खोजो", "ढूंढो",
    ],
    capabilities: ["web-search", "real-time-info"],
    requiredEnvVars: ["TAVILY_API_KEY"],
    npmDependencies: {},
    isBuiltin: true,
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    useCount: 0,
    author: "builtin",
    testStatus: "passed",
  };

  private plugin = new SearchPlugin();

  async execute(input: string, context: SkillContext): Promise<SkillResult> {
    logger.info(`Search skill: "${input.slice(0, 60)}"`);

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
    };
  }
}
