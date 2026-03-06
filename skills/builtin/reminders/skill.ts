/**
 * Reminders skill — wraps the existing RemindersPlugin for the skill system.
 */

import { SkillBase, SkillContext, SkillResult, SkillManifest } from "../../../core/skill-base";
import { RemindersPlugin } from "../../../plugins/reminders/plugin";
import { logger } from "../../../utils/logger";

export default class RemindersSkill extends SkillBase {
  manifest: SkillManifest = {
    name: "reminders",
    displayName: "Reminders & Alerts",
    version: "1.0.0",
    description: "Set, list, and cancel scheduled reminders",
    triggers: [
      "remind", "reminder", "alert", "notify", "schedule",
      "alarm", "याद", "याद दिला", "reminders", "set reminder",
    ],
    capabilities: ["scheduling", "notifications"],
    requiredEnvVars: [],
    npmDependencies: {},
    isBuiltin: true,
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    useCount: 0,
    author: "builtin",
    testStatus: "passed",
  };

  private plugin = new RemindersPlugin();

  async execute(input: string, context: SkillContext): Promise<SkillResult> {
    logger.info(`Reminders skill: "${input.slice(0, 60)}"`);

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
