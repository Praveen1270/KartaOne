/**
 * Planner — converts a natural language goal into a structured execution plan.
 * This is what distinguishes an autonomous agent from a simple chatbot.
 */

import { LLM } from "./llm";
import { logger } from "../utils/logger";

export interface ExecutionPlan {
  goal: string;
  steps: PlanStep[];
  estimatedTime: string;
  requiresConfirmation: boolean;
  confirmationMessage?: string;
}

export interface PlanStep {
  stepNumber: number;
  description: string;
  plugin: string;
  action: string;
  params: Record<string, unknown>;
  waitForHuman?: boolean;
  humanPrompt?: string;
}

const PLANNER_PROMPT = `You are a planning AI for an autonomous agent that controls a browser
to order food and buy products in India via Cash on Delivery.

Available plugins:
- zomato: Order food from Zomato (actions: search, add_to_cart, checkout_cod)
- swiggy: Order food from Swiggy (actions: search, add_to_cart, checkout_cod)
- universal_shop: Buy from any website with COD (actions: navigate, search, add_to_cart, checkout_cod)
- search: Search the web for information (actions: search)
- reminders: Set reminders and alerts (actions: set_reminder, list_reminders, cancel_reminder)
- chat: Answer questions and have conversations (actions: respond)

Return ONLY valid JSON matching this exact TypeScript type (no markdown, no explanation):
{
  "goal": "string",
  "steps": [{
    "stepNumber": 1,
    "description": "human readable step",
    "plugin": "plugin_name",
    "action": "action_name",
    "params": {},
    "waitForHuman": false,
    "humanPrompt": null
  }],
  "estimatedTime": "2-3 minutes",
  "requiresConfirmation": true,
  "confirmationMessage": "Shall I proceed? (YES/NO)"
}

RULES:
1. Always set requiresConfirmation=true for any order or purchase
2. If login OTP is needed, add a waitForHuman step for it
3. For COD orders, always verify COD availability before checkout
4. Keep steps minimal — combine what can be done atomically
5. Include estimated cost in confirmationMessage when known
6. For pure chat/search queries, requiresConfirmation=false
7. Respond in the same language as the user (Hindi or English)`;

export class Planner {
  constructor(private llm: LLM) {}

  async plan(
    goal: string,
    userContext: Record<string, unknown>
  ): Promise<ExecutionPlan> {
    logger.info(`Planning: "${goal.slice(0, 60)}"`);

    try {
      const response = await this.llm.chat(
        [
          {
            role: "user",
            content: `User goal: "${goal}"\nUser context: ${JSON.stringify(userContext)}\n\nCreate execution plan:`,
          },
        ],
        PLANNER_PROMPT
      );

      const json = response.replace(/```json|```/g, "").trim();
      const plan = JSON.parse(json) as ExecutionPlan;
      logger.info(`Plan created: ${plan.steps.length} steps, ~${plan.estimatedTime}`);
      return plan;
    } catch (err) {
      logger.warn("Planner JSON parse failed, using chat fallback:", err);
      return this.chatFallback(goal);
    }
  }

  private chatFallback(goal: string): ExecutionPlan {
    return {
      goal,
      steps: [
        {
          stepNumber: 1,
          description: "Handle via chat",
          plugin: "chat",
          action: "respond",
          params: { input: goal },
        },
      ],
      estimatedTime: "instant",
      requiresConfirmation: false,
    };
  }
}
