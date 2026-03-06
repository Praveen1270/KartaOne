/**
 * Web Search Plugin — uses Tavily API for real-time web search.
 * Falls back to a basic prompt if no API key is configured.
 */

import axios from "axios";
import { PluginBase, PluginResult, AgentContext } from "../../core/plugin-base";
import { logger } from "../../utils/logger";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export class SearchPlugin extends PluginBase {
  name = "search";
  description = "Search the web for real-time information using Tavily";
  triggers = [
    "search", "find", "look up", "what is", "who is", "how much",
    "price of", "news", "latest", "today's", "current", "nifty",
    "sensex", "weather", "stock", "खोजो", "ढूंढो",
  ];

  async run(input: string, context: AgentContext): Promise<PluginResult> {
    await context.sendMessage("🔍 Searching the web...");

    const query = input
      .replace(/^(search|find|look up|what is|who is)\s+/i, "")
      .trim();

    if (!process.env.TAVILY_API_KEY) {
      logger.warn("TAVILY_API_KEY not set — returning prompt only");
      return this.error(
        `🔍 Web search is not configured.\n` +
        `Set TAVILY_API_KEY in your .env to enable it.\n` +
        `Get a free key at https://tavily.com`
      );
    }

    try {
      const results = await this.tavilySearch(query);
      const formatted = this.formatResults(results, query);
      return this.success(formatted, { results });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Search failed:", err);
      return this.error(`❌ Search failed: ${msg}`);
    }
  }

  private async tavilySearch(query: string): Promise<TavilyResult[]> {
    const response = await axios.post<{ results: TavilyResult[] }>(
      "https://api.tavily.com/search",
      {
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: "basic",
        max_results: 5,
        include_answer: true,
      },
      { timeout: 10000 }
    );
    return response.data.results ?? [];
  }

  private formatResults(results: TavilyResult[], query: string): string {
    if (!results.length) return `🔍 No results found for: "${query}"`;

    const top = results.slice(0, 4);
    const lines = top
      .map((r, i) => `${i + 1}. *${r.title}*\n${r.content.slice(0, 200)}...\n🔗 ${r.url}`)
      .join("\n\n");

    return `🔍 *Search: "${query}"*\n\n${lines}`;
  }
}
