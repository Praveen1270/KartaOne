/**
 * PageVision — uses Claude Vision to understand what is on screen.
 * The key fallback mechanism when CSS selectors fail on dynamic pages.
 * Works on ANY website without hardcoded selectors.
 */

import * as fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../utils/logger";

export interface ElementLocation {
  found: boolean;
  description: string;
  location?: string;
  coordinates?: string;
}

export interface OrderDetails {
  items: string[];
  total: number;
  deliveryTime: string;
  orderId: string;
}

export class PageVision {
  private claude: Anthropic;

  constructor() {
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async understandPage(screenshotPath: string, question: string): Promise<string> {
    if (!fs.existsSync(screenshotPath)) {
      throw new Error(`Screenshot not found: ${screenshotPath}`);
    }

    const imageData = fs.readFileSync(screenshotPath).toString("base64");
    logger.info(`Vision query: ${question.slice(0, 60)}`);

    const response = await this.claude.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: imageData,
              },
            },
            {
              type: "text",
              text: `You are analysing a screenshot of a website. Answer precisely:\n${question}\nBe specific and concise.`,
            },
          ],
        },
      ],
    });

    return (response.content[0] as { type: string; text: string }).text;
  }

  async findElement(
    screenshotPath: string,
    elementDescription: string
  ): Promise<ElementLocation> {
    const answer = await this.understandPage(
      screenshotPath,
      `Find "${elementDescription}" on this page.
       Is it visible? Where is it (top/middle/bottom, left/center/right)?
       Reply as JSON only: {"found": true, "description": "...", "location": "top-right"}`
    );

    try {
      return JSON.parse(answer.replace(/```json|```/g, "").trim()) as ElementLocation;
    } catch {
      return { found: answer.toLowerCase().includes("yes"), description: answer };
    }
  }

  async extractOrderDetails(screenshotPath: string): Promise<OrderDetails> {
    const answer = await this.understandPage(
      screenshotPath,
      `This is an order confirmation or cart page.
       Extract exactly:
       - items: list of item names ordered
       - total: numeric total price (just the number, no ₹ symbol)
       - deliveryTime: estimated delivery time as string
       - orderId: order ID or confirmation number (empty string if not visible)
       Reply as JSON only (no markdown):
       {"items": [], "total": 0, "deliveryTime": "", "orderId": ""}`
    );

    try {
      return JSON.parse(answer.replace(/```json|```/g, "").trim()) as OrderDetails;
    } catch {
      return { items: ["Unknown item"], total: 0, deliveryTime: "30-45 minutes", orderId: "" };
    }
  }

  async isCODAvailable(screenshotPath: string): Promise<boolean> {
    const answer = await this.understandPage(
      screenshotPath,
      `Is "Cash on Delivery" or "COD" available as a payment option on this page? Reply only YES or NO.`
    );
    return answer.trim().toUpperCase().startsWith("YES");
  }

  async getPageType(screenshotPath: string): Promise<string> {
    return await this.understandPage(
      screenshotPath,
      `What type of page is this? Choose one: homepage, search-results, restaurant-menu, product-detail, cart, checkout, payment, order-confirmation, login, otp-entry, other`
    );
  }
}
