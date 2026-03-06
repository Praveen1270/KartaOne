/**
 * Abstract base class every skill (builtin or learned) must extend.
 * This is the unified contract the agent uses to call any skill.
 */

export interface SkillManifest {
  name: string;                                    // unique slug: "podcast-clips"
  displayName: string;                             // "Podcast Clip Generator"
  version: string;                                 // semver: "1.0.0"
  description: string;                             // what this skill does
  triggers: string[];                              // ["clip", "podcast", "highlight"]
  capabilities: string[];                          // ["video", "audio", "file_output"]
  requiredEnvVars: string[];                       // ["OPENAI_API_KEY"]
  npmDependencies: Record<string, string>;         // {"fluent-ffmpeg": "^2.1.0"}
  isBuiltin: boolean;
  createdAt: string;
  lastUsed: string;
  useCount: number;
  author: "builtin" | "self-generated";
  testStatus: "untested" | "passed" | "failed";
}

export interface UploadedFile {
  fileName: string;
  path: string;
  mimeType: string;
  size: number;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface UserProfile {
  name: string;
  phone: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    pincode: string;
    phone: string;
    name: string;
  };
  language: string;
  preferences: Record<string, unknown>;
}

export interface SkillContext {
  userId: string;
  message: string;
  files: UploadedFile[];
  profile: UserProfile;
  memory: Record<string, string>;
  history: Message[];
  reply: (text: string) => Promise<void>;
  replyWithFile: (path: string, caption?: string) => Promise<void>;
  replyWithPhoto: (path: string, caption?: string) => Promise<void>;
  askUser: (question: string) => Promise<string>;
  updateMessage: (text: string) => Promise<void>;
}

export interface SkillResult {
  success: boolean;
  output: string;
  files?: string[];
  data?: unknown;
  needsFollowUp?: boolean;
}

export abstract class SkillBase {
  abstract manifest: SkillManifest;

  abstract execute(
    input: string,
    context: SkillContext
  ): Promise<SkillResult>;

  canHandle(input: string): boolean {
    const lower = input.toLowerCase();
    return this.manifest.triggers.some((t) => lower.includes(t.toLowerCase()));
  }

  protected ok(output: string, files?: string[]): SkillResult {
    return { success: true, output, files };
  }

  protected fail(reason: string): SkillResult {
    return { success: false, output: `❌ ${reason}` };
  }

  protected async progress(context: SkillContext, msg: string): Promise<void> {
    await context.updateMessage(`⏳ ${msg}`);
  }
}
