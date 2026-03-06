/**
 * SandboxExecutor — wraps skill execution with timeout and error boundary.
 * Every skill call goes through here so a buggy skill can't crash the agent.
 */

import { SkillBase, SkillContext, SkillResult } from "../core/skill-base";
import { logger } from "../utils/logger";

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes per skill execution

export class SandboxExecutor {
  async run(
    skill: SkillBase,
    input: string,
    context: SkillContext,
    timeoutMs = DEFAULT_TIMEOUT_MS
  ): Promise<SkillResult> {
    const skillName = skill.manifest.name;

    const execPromise = skill
      .execute(input, context)
      .then((result) => {
        // Update skill usage stats
        skill.manifest.lastUsed = new Date().toISOString();
        skill.manifest.useCount += 1;
        return result;
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Skill ${skillName} execution error:`, err);
        return {
          success: false,
          output: `❌ The *${skill.manifest.displayName}* skill ran into an error.\n\`${msg}\``,
        } satisfies SkillResult;
      });

    const timeoutPromise = new Promise<SkillResult>((resolve) =>
      setTimeout(() => {
        logger.warn(`Skill ${skillName} timed out after ${timeoutMs}ms`);
        resolve({
          success: false,
          output: `⏱ The *${skill.manifest.displayName}* skill timed out. Please try again.`,
        });
      }, timeoutMs)
    );

    return Promise.race([execPromise, timeoutPromise]);
  }
}
