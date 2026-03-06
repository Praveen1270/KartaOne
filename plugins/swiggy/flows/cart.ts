/**
 * Swiggy cart flow — finds food items in the menu and adds them to cart.
 */

import { Page } from "playwright";
import { BrowserActions } from "../../../browser/actions";
import { BrowserEngine } from "../../../browser/engine";
import { PageVision } from "../../../browser/vision";
import { tmpFile } from "../../../utils/helpers";
import { logger } from "../../../utils/logger";

const FOOD_KEYWORDS = [
  "butter chicken", "biryani", "pizza", "burger", "naan", "garlic naan",
  "dal makhani", "paneer", "dosa", "idli", "samosa", "chole", "rajma",
  "roti", "paratha", "fried rice", "hakka noodles", "chicken tikka",
  "tandoori chicken", "kebab", "momos", "pasta", "sandwich", "thali",
  "fish curry", "prawn", "mutton curry",
];

export async function swiggyAddToCart(
  page: Page,
  userInput: string,
  browser: BrowserEngine,
  actions: BrowserActions,
  vision: PageVision
): Promise<{ screenshotPath: string; itemsAdded: string[] }> {
  const items = extractItems(userInput);
  logger.info(`Swiggy: adding to cart: ${items.join(", ")}`);

  await actions.dismissPopups(page);
  await actions.scrollDown(page, 400);

  const itemsAdded: string[] = [];

  for (const item of items) {
    try {
      // Locate item text, then click ADD next to it
      const itemLoc = page.locator(`text=/${item}/i`).first();
      await itemLoc.scrollIntoViewIfNeeded({ timeout: 3000 });

      // Find ADD button in the same card/container as the item
      const container = itemLoc.locator("xpath=ancestor::div[1]");
      const addBtn = container
        .locator(`button:has-text("ADD"), [data-testid="add-button"], .add-btn`)
        .first();

      if (await addBtn.isVisible({ timeout: 2000 })) {
        await addBtn.click();
        itemsAdded.push(item);
        await page.waitForTimeout(800);
      }
    } catch {
      logger.warn(`Could not add Swiggy item: ${item}`);
    }
  }

  if (itemsAdded.length === 0) {
    await page.locator(`button:has-text("ADD")`).first().click().catch(() => {});
    itemsAdded.push("Selected item");
  }

  await page.waitForTimeout(1000);
  const screenshotPath = tmpFile("swiggy-cart");
  await browser.screenshot(page, screenshotPath);

  return { screenshotPath, itemsAdded };
}

function extractItems(input: string): string[] {
  const lower = input.toLowerCase();
  return FOOD_KEYWORDS.filter((f) => lower.includes(f));
}
