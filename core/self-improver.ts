/**
 * SelfImprover — THE CORE INNOVATION.
 *
 * When no skill or plugin matches the user's request, this kicks in.
 * It asks Claude to write a complete TypeScript skill, validates it for
 * safety, runs it in a sandboxed child process, and if tests pass,
 * installs it permanently so it's available for all future requests.
 *
 * Karta One never says "I can't do that." — it builds the capability.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { SkillManifest } from "./skill-base";
import { SandboxValidator } from "../sandbox/validator";
import { SandboxTester } from "../sandbox/tester";
import { logger } from "../utils/logger";

const SKILL_WRITER_SYSTEM_PROMPT = `
You are an expert TypeScript developer writing skills for an autonomous AI agent called Karta One — Personal AI Assistant.

A "skill" is a TypeScript class that extends SkillBase and implements execute(input, context): Promise<SkillResult>.
Karta One uses these skills to fulfil user requests autonomously.

The skill has access to:
- context.reply(text) — send text to user via Telegram
- context.replyWithFile(path, caption) — send a file to user
- context.replyWithPhoto(path, caption) — send an image to user
- context.askUser(question) — ask user something, await their text reply
- context.updateMessage(text) — edit the previous progress message
- context.files[] — any files the user uploaded (each has .path, .fileName, .mimeType, .size)
- context.message — the original user message text
- context.profile — user profile (name, phone, address.city etc.)
- context.memory — key-value memory of things the agent remembers about the user

RULES:
1. Only import npm packages declared in the manifest's npmDependencies
2. Use async/await for all I/O — never .then() chains
3. Call context.updateMessage() for every major step so the user sees progress
4. Wrap everything in try/catch — return this.fail(reason) on any error
5. Write ALL output files under the system tmp directory: require("os").tmpdir() + "/bharat-" + manifest.name + "-" + Date.now()
6. After sending files to user, clean up the temp directory
7. NEVER use process.exit() under any circumstance
8. NEVER delete files outside the system tmp directory
9. NEVER make network requests outside what the skill explicitly needs
10. ALL external API keys must come from process.env, never hardcoded
11. The skill must be fully autonomous — no manual steps required
12. Use context.askUser() if the skill needs clarification from the user

IMPORTS:
- The skill file will be run by ts-node from the project root
- Import skill-base like this: import { SkillBase, SkillContext, SkillResult, SkillManifest } from "../../../core/skill-base";
- Import any npm package you declared in npmDependencies normally

OUTPUT FORMAT — return ONLY valid JSON, no markdown, no explanation:
{
  "manifest": {
    "name": "skill-slug-with-dashes",
    "displayName": "Human Readable Name",
    "version": "1.0.0",
    "description": "One sentence: what this skill does",
    "triggers": ["keyword1", "keyword2", "keyword3"],
    "capabilities": ["what", "it", "produces"],
    "requiredEnvVars": [],
    "npmDependencies": {},
    "isBuiltin": false,
    "author": "self-generated",
    "testStatus": "untested"
  },
  "code": "// Complete TypeScript skill code here — the full file contents",
  "testCode": "// Test code that imports and instantiates the skill, calls execute() with mock context, exits 0 on success",
  "installInstructions": "Any special one-time setup needed (empty string if none)"
}
`.trim();

export class SelfImprover {
  private claude: Anthropic;
  private validator: SandboxValidator;
  private tester: SandboxTester;
  private learnedSkillsDir = path.join(process.cwd(), "skills", "learned");
  private registryPath = path.join(
    process.cwd(),
    "skills",
    "learned",
    "skill-registry.json"
  );

  constructor() {
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.validator = new SandboxValidator();
    this.tester = new SandboxTester();
  }

  async createSkill(
    userRequest: string,
    context: {
      reply: (msg: string) => Promise<void>;
      updateMessage: (msg: string) => Promise<void>;
    }
  ): Promise<{ success: boolean; skillName?: string; error?: string }> {
    await context.reply(
      "🧠 *I don't have this skill yet — but I can build it!*\n\n" +
        "⏳ Writing the code now, this takes ~30 seconds..."
    );

    let attempts = 0;
    let lastError = "";

    while (attempts < 3) {
      attempts++;

      try {
        // ── Step 1: Generate skill via LLM ───────────────────
        await context.updateMessage(
          `🧠 Writing skill (attempt ${attempts}/3)...\n` +
            `Analysing what you need...`
        );

        const prompt = lastError
          ? `${userRequest}\n\nPrevious attempt failed with this error:\n${lastError}\n\nPlease fix these issues in your new version.`
          : userRequest;

        const generated = await this.generateSkillCode(prompt);

        // ── Step 2: Safety validation ─────────────────────────
        await context.updateMessage("🔒 Running safety check...");
        const validation = this.validator.validate(generated.code);

        if (!validation.safe) {
          lastError = `Safety violations: ${validation.issues.join(", ")}`;
          logger.warn(`Skill safety check failed: ${lastError}`);
          continue;
        }

        if (validation.warnings.length > 0) {
          logger.warn(`Skill warnings: ${validation.warnings.join(", ")}`);
        }

        // ── Step 3: Install npm dependencies ─────────────────
        const depCount = Object.keys(generated.manifest.npmDependencies).length;
        if (depCount > 0) {
          await context.updateMessage(
            `📦 Installing ${depCount} package(s)...`
          );
          await this.installDependencies(generated.manifest.npmDependencies);
        }

        // ── Step 4: Write skill files to disk ─────────────────
        await context.updateMessage("💾 Saving skill files...");
        const skillDir = path.join(
          this.learnedSkillsDir,
          generated.manifest.name
        );
        await fs.mkdir(skillDir, { recursive: true });

        await fs.writeFile(
          path.join(skillDir, "skill.ts"),
          generated.code,
          "utf-8"
        );
        await fs.writeFile(
          path.join(skillDir, "skill.test.ts"),
          generated.testCode,
          "utf-8"
        );
        await fs.writeFile(
          path.join(skillDir, "manifest.json"),
          JSON.stringify(generated.manifest, null, 2),
          "utf-8"
        );
        await fs.writeFile(
          path.join(skillDir, "deps.json"),
          JSON.stringify(generated.manifest.npmDependencies, null, 2),
          "utf-8"
        );

        // ── Step 5: Run sandbox tests ─────────────────────────
        await context.updateMessage("🧪 Running tests in sandbox...");
        const testResult = await this.tester.test(
          path.join(skillDir, "skill.ts"),
          path.join(skillDir, "skill.test.ts")
        );

        if (!testResult.passed) {
          lastError = `Tests failed:\n${testResult.errors.join("\n")}`;
          logger.warn(`Skill tests failed (attempt ${attempts}): ${lastError}`);
          // Remove the failed skill files before retrying
          await fs.rm(skillDir, { recursive: true, force: true }).catch(() => {});
          continue;
        }

        // ── Step 6: Register the skill ────────────────────────
        await this.registerSkill(generated.manifest);

        await context.updateMessage(
          `✅ *New skill created: "${generated.manifest.displayName}"*\n\n` +
            `Running it now...`
        );

        logger.info(`New skill installed and registered: ${generated.manifest.name}`);
        return { success: true, skillName: generated.manifest.name };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        lastError = msg;
        logger.error(`Skill creation attempt ${attempts} failed:`, error);
      }
    }

    return {
      success: false,
      error: `Failed after 3 attempts. Last error: ${lastError}`,
    };
  }

  private async generateSkillCode(userRequest: string): Promise<{
    manifest: SkillManifest;
    code: string;
    testCode: string;
  }> {
    const response = await this.claude.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 6000,
      system: SKILL_WRITER_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Write a complete skill that can handle this user request:\n\n"${userRequest}"\n\nReturn ONLY valid JSON as described. No markdown fences, no explanation.`,
        },
      ],
    });

    const raw = (response.content[0] as { type: string; text: string }).text;
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as {
      manifest: Omit<SkillManifest, "createdAt" | "lastUsed" | "useCount">;
      code: string;
      testCode: string;
    };

    return {
      manifest: {
        ...parsed.manifest,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        useCount: 0,
        testStatus: "untested",
      },
      code: parsed.code,
      testCode: parsed.testCode,
    };
  }

  private async installDependencies(
    deps: Record<string, string>
  ): Promise<void> {
    const packages = Object.entries(deps)
      .map(([pkg, ver]) => `${pkg}@${ver}`)
      .join(" ");
    execSync(`npm install ${packages} --save --legacy-peer-deps`, {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 120_000,
    });
  }

  private async registerSkill(manifest: SkillManifest): Promise<void> {
    let registry: SkillManifest[] = [];
    try {
      const raw = await fs.readFile(this.registryPath, "utf-8");
      registry = JSON.parse(raw) as SkillManifest[];
    } catch {
      registry = [];
    }
    registry = registry.filter((s) => s.name !== manifest.name);
    registry.push({ ...manifest, testStatus: "passed" });
    await fs.writeFile(
      this.registryPath,
      JSON.stringify(registry, null, 2),
      "utf-8"
    );
  }

  async listLearnedSkills(): Promise<SkillManifest[]> {
    try {
      const raw = await fs.readFile(this.registryPath, "utf-8");
      return JSON.parse(raw) as SkillManifest[];
    } catch {
      return [];
    }
  }

  async deleteSkill(skillName: string): Promise<boolean> {
    const skillDir = path.join(this.learnedSkillsDir, skillName);
    try {
      await fs.rm(skillDir, { recursive: true, force: true });
      const registry = await this.listLearnedSkills();
      const updated = registry.filter((s) => s.name !== skillName);
      await fs.writeFile(
        this.registryPath,
        JSON.stringify(updated, null, 2),
        "utf-8"
      );
      return true;
    } catch {
      return false;
    }
  }
}
