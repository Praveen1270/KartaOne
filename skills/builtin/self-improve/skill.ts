/**
 * Karta One — Self-Improvement meta-skill.
 * Handles commands like "list my skills", "delete skill X", "what can you do".
 * This is the management interface for Karta One's self-evolution system.
 */

import { SkillBase, SkillContext, SkillResult, SkillManifest } from "../../../core/skill-base";
import { SelfImprover } from "../../../core/self-improver";

export default class SelfImproveSkill extends SkillBase {
  manifest: SkillManifest = {
    name: "self-improve",
    displayName: "Self-Improvement",
    version: "1.0.0",
    description: "Manage Karta One skills — list, delete, and trigger new skill creation",
    triggers: [
      "list skills",
      "show skills",
      "what can you do",
      "what skills",
      "my skills",
      "learned skills",
      "delete skill",
      "remove skill",
      "upgrade skill",
      "new skill",
      "/skills",
    ],
    capabilities: ["meta", "skill-management"],
    requiredEnvVars: [],
    npmDependencies: {},
    isBuiltin: true,
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    useCount: 0,
    author: "builtin",
    testStatus: "passed",
  };

  private improver = new SelfImprover();

  async execute(input: string, context: SkillContext): Promise<SkillResult> {
    const lower = input.toLowerCase();

    if (
      lower.includes("list") ||
      lower.includes("show") ||
      lower.includes("what can") ||
      lower.includes("what skills") ||
      lower.includes("/skills")
    ) {
      return this.listSkills(context);
    }

    if (lower.includes("delete") || lower.includes("remove")) {
      const skillName = this.extractSkillName(input);
      if (!skillName) {
        return this.fail(
          "Please specify which skill to delete.\n" +
            "Example: `delete skill podcast-clips`"
        );
      }
      const deleted = await this.improver.deleteSkill(skillName);
      return deleted
        ? this.ok(`✅ Skill \`${skillName}\` has been deleted.`)
        : this.fail(`Skill \`${skillName}\` not found in learned skills.`);
    }

    await context.reply(
      "🧠 *Karta One — Self-Improvement System*\n\n" +
        "*Commands:*\n" +
        "• `list skills` — see all my skills\n" +
        "• `delete skill <name>` — remove a learned skill\n" +
        "• Just ask me to do *anything new* — I'll write the code to do it!\n\n" +
        "_Karta One never says I can't do that. It builds the capability._"
    );
    return this.ok("");
  }

  private async listSkills(context: SkillContext): Promise<SkillResult> {
    const learned = await this.improver.listLearnedSkills();

    const builtinList = [
      "💬 Chat & conversation (LLM fallback)",
      "🔍 Web search (Tavily)",
      "⏰ Reminders & scheduling",
      "🍕 Zomato food ordering (COD)",
      "🛒 COD shopping (Amazon / Flipkart / Meesho)",
    ];

    const learnedList =
      learned.length > 0
        ? learned.map(
            (s) =>
              `🧠 *${s.displayName}* (\`${s.name}\`) — used ${s.useCount}x\n   ${s.description}`
          )
        : ["_None yet — ask me to do something new and I'll build it!_"];

    const total = 5 + learned.length;

    void context; // context not used here, result is sent via return
    return this.ok(
      `🛠️ *My Skills (${total} total)*\n\n` +
        `*Built-in:*\n${builtinList.join("\n")}\n\n` +
        `*Self-Learned:*\n${learnedList.join("\n\n")}\n\n` +
        `_Ask me to do anything new and I'll build the skill!_`
    );
  }

  private extractSkillName(input: string): string | null {
    const match = input.match(
      /(?:delete|remove|upgrade)\s+skill\s+["']?([a-z0-9-]+)["']?/i
    );
    return match?.[1] ?? null;
  }
}
