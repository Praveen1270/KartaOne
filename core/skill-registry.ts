/**
 * SkillRegistry — loads ALL skills (builtin + learned) at startup.
 * Dynamically imports new learned skills as they are created.
 * Routes incoming messages to the right skill by trigger matching.
 */

import * as path from "path";
import * as fs from "fs";
import { SkillBase } from "./skill-base";
import { logger } from "../utils/logger";

export class SkillRegistry {
  private skills = new Map<string, SkillBase>();
  private builtinDir = path.join(process.cwd(), "skills", "builtin");
  private learnedDir = path.join(process.cwd(), "skills", "learned");

  async loadAll(): Promise<void> {
    await this.loadBuiltins();
    await this.loadLearned();
    logger.info(`SkillRegistry: loaded ${this.skills.size} skills`);
  }

  private async loadBuiltins(): Promise<void> {
    if (!fs.existsSync(this.builtinDir)) return;
    const dirs = fs.readdirSync(this.builtinDir);
    for (const dir of dirs) {
      try {
        const skillPath = path.join(this.builtinDir, dir, "skill.ts");
        if (!fs.existsSync(skillPath)) continue;
        const mod = await import(skillPath);
        const SkillClass = mod.default ?? mod[Object.keys(mod)[0]];
        const skill: SkillBase = new SkillClass();
        this.skills.set(skill.manifest.name, skill);
        logger.info(`Loaded builtin skill: ${skill.manifest.name}`);
      } catch (e) {
        logger.error(`Failed to load builtin skill from ${dir}:`, e);
      }
    }
  }

  async loadLearned(): Promise<void> {
    if (!fs.existsSync(this.learnedDir)) {
      fs.mkdirSync(this.learnedDir, { recursive: true });
      return;
    }
    const registryPath = path.join(this.learnedDir, "skill-registry.json");
    if (!fs.existsSync(registryPath)) return;

    let registry: Array<{ name: string; testStatus: string }> = [];
    try {
      registry = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
    } catch {
      return;
    }

    for (const manifest of registry) {
      if (manifest.testStatus !== "passed") continue;
      try {
        const skillPath = path.join(this.learnedDir, manifest.name, "skill.ts");
        if (!fs.existsSync(skillPath)) continue;
        // Clear require cache so hot-reload works
        delete require.cache[require.resolve(skillPath)];
        const mod = await import(skillPath);
        const SkillClass = mod.default ?? mod[Object.keys(mod)[0]];
        const skill: SkillBase = new SkillClass();
        this.skills.set(skill.manifest.name, skill);
        logger.info(`Loaded learned skill: ${manifest.name}`);
      } catch (e) {
        logger.error(`Failed to load learned skill ${manifest.name}:`, e);
      }
    }
  }

  /** Hot-load a single newly created skill without restarting. */
  async hotLoad(skillName: string): Promise<boolean> {
    try {
      const skillPath = path.join(this.learnedDir, skillName, "skill.ts");
      delete require.cache[require.resolve(skillPath)];
      const mod = await import(skillPath);
      const SkillClass = mod.default ?? mod[Object.keys(mod)[0]];
      const skill: SkillBase = new SkillClass();
      this.skills.set(skill.manifest.name, skill);
      logger.info(`Hot-loaded new skill: ${skillName}`);
      return true;
    } catch (e) {
      logger.error(`Hot-load failed for ${skillName}:`, e);
      return false;
    }
  }

  /**
   * Find the best matching skill for user input.
   * Scores by number of trigger keyword matches.
   * The self-improve meta-skill is checked separately as the last resort before self-writing.
   */
  route(input: string): SkillBase | null {
    let bestSkill: SkillBase | null = null;
    let bestScore = 0;

    for (const skill of this.skills.values()) {
      if (skill.manifest.name === "self-improve") continue; // handled separately
      const score = skill.manifest.triggers.filter((t) =>
        input.toLowerCase().includes(t.toLowerCase())
      ).length;
      if (score > bestScore) {
        bestScore = score;
        bestSkill = skill;
      }
    }

    if (bestSkill && bestScore > 0) {
      logger.info(`Routing to skill: ${bestSkill.manifest.name} (score=${bestScore})`);
      return bestSkill;
    }

    // Check self-improve skill for management commands
    const selfImprove = this.skills.get("self-improve");
    if (selfImprove?.canHandle(input)) return selfImprove;

    return null;
  }

  get(name: string): SkillBase | undefined {
    return this.skills.get(name);
  }

  list(): SkillBase[] {
    return Array.from(this.skills.values());
  }

  /** Human-readable list of all skills for display in Telegram. */
  describe(): string {
    return Array.from(this.skills.values())
      .map((s) => `- ${s.manifest.displayName} (${s.manifest.name}): ${s.manifest.description}`)
      .join("\n");
  }
}
