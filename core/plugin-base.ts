/**
 * Abstract base class every plugin must extend.
 * OpenClaw-style modular architecture — each plugin is self-contained.
 */

export interface PluginResult {
  success: boolean;
  output: string;
  data?: Record<string, unknown>;
  requiresHumanInput?: boolean;
  humanInputPrompt?: string;
  nextAction?: string;
}

export interface AgentContext {
  userId: string;
  userMessage: string;
  conversationHistory: Array<{ role: string; content: string }>;
  userProfile: UserProfile;
  memory: Record<string, string>;
  params?: Record<string, unknown>;
  sendMessage: (msg: string) => Promise<void>;
  sendPhoto: (filePath: string, caption?: string) => Promise<void>;
}

export interface UserProfile {
  name: string;
  phone: string;
  address: DeliveryAddress;
  language: string;
  preferences: Record<string, unknown>;
}

export interface DeliveryAddress {
  line1: string;
  line2: string;
  city: string;
  pincode: string;
  phone: string;
  name: string;
}

export abstract class PluginBase {
  abstract name: string;
  abstract description: string;
  abstract triggers: string[];

  canHandle(input: string): boolean {
    const lower = input.toLowerCase();
    return this.triggers.some((t) => lower.includes(t.toLowerCase()));
  }

  abstract run(input: string, context: AgentContext): Promise<PluginResult>;

  protected success(output: string, data?: Record<string, unknown>): PluginResult {
    return { success: true, output, data };
  }

  protected error(output: string, errMsg?: string): PluginResult {
    return { success: false, output, data: errMsg ? { error: errMsg } : undefined };
  }

  protected needsInput(prompt: string, data?: Record<string, unknown>): PluginResult {
    return {
      success: true,
      output: prompt,
      data,
      requiresHumanInput: true,
      humanInputPrompt: prompt,
    };
  }
}
