/**
 * Plugin registry — loads all plugins and routes incoming messages to
 * the most appropriate plugin based on trigger keywords and LLM scoring.
 */

import { PluginBase } from "./plugin-base";
import { logger } from "../utils/logger";

export class PluginRegistry {
  private plugins: Map<string, PluginBase> = new Map();

  register(plugin: PluginBase): void {
    this.plugins.set(plugin.name, plugin);
    logger.info(`Plugin registered: ${plugin.name}`);
  }

  get(name: string): PluginBase | undefined {
    return this.plugins.get(name);
  }

  all(): PluginBase[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Find the best matching plugin for user input.
   * Priority: explicit keyword match → most-trigger-matches → chat fallback.
   */
  match(input: string): PluginBase {
    const lower = input.toLowerCase();

    // Score each plugin by how many triggers match
    let bestPlugin: PluginBase | undefined;
    let bestScore = 0;

    for (const plugin of this.plugins.values()) {
      if (plugin.name === "chat") continue; // Fallback — check last
      const score = plugin.triggers.filter((t) =>
        lower.includes(t.toLowerCase())
      ).length;
      if (score > bestScore) {
        bestScore = score;
        bestPlugin = plugin;
      }
    }

    if (bestPlugin && bestScore > 0) {
      logger.info(`Routing to plugin: ${bestPlugin.name} (score=${bestScore})`);
      return bestPlugin;
    }

    // Fall back to chat plugin
    const chat = this.plugins.get("chat");
    if (chat) return chat;

    throw new Error("No plugin could handle the request and no chat fallback registered");
  }

  /** List all registered plugin names + descriptions for the planner prompt. */
  describe(): string {
    return Array.from(this.plugins.values())
      .map((p) => `- ${p.name}: ${p.description}`)
      .join("\n");
  }
}
