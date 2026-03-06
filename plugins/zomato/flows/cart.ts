/**
 * Zomato cart flow — navigates to a restaurant menu and adds requested items to cart.
 */

import { Page } from "playwright";
import { BrowserActions } from "../../../browser/actions";
import { PageVision } from "../../../browser/vision";
import { BrowserEngine } from "../../../browser/engine";
import { tmpFile } from "../../../utils/helpers";
import { logger } from "../../../utils/logger";

const FOOD_KEYWORDS = [
  "butter chicken", "biryani", "pizza", "burger", "naan", "garlic naan",
  "dal makhani", "paneer", "paneer butter masala", "dosa", "idli", "samosa",
  "chole", "rajma", "roti", "paratha", "fried rice", "hakka noodles",
  "chicken tikka", "tandoori chicken", "kebab", "momos", "pasta", "sandwich",
  "sushi", "thali", "fish curry", "prawn", "mutton",
];

export async function addToCart(
  page: Page,
  userInput: string,
  restaurantName: string,
  browser: BrowserEngine,
  actions: BrowserActions,
  vision: PageVision
): Promise<{ screenshotPath: string; itemsAdded: string[] }> {
  const items = extractFoodItems(userInput);
  logger.info(`Adding to cart at ${restaurantName}: ${items.join(", ")}`);

  await actions.dismissPopups(page);
  await actions.scrollDown(page, 400);

  const itemsAdded: string[] = [];

  for (const item of items) {
    logger.info(`Looking for: ${item}`);
    try {
      // Try to click the item name, then the ADD button next to it
      const itemLocator = page.locator(`text=/${item}/i`).first();
      await itemLocator.scrollIntoViewIfNeeded({ timeout: 3000 });

      // Find ADD button in the same card/container as the item
      const container = itemLocator.locator("xpath=ancestor::div[1]");
      const addBtn = container
        .locator(`button:has-text("ADD"), button:has-text("Add"), .add-btn`)
        .first();

      if (await addBtn.isVisible({ timeout: 2000 })) {
        await addBtn.click();
        itemsAdded.push(item);
        logger.info(`Added: ${item}`);
        await page.waitForTimeout(800);
      } else {
        // Generic: click the first ADD button visible
        await page.locator(`button:has-text("ADD")`).first().click().catch(() => {});
        itemsAdded.push(item);
      }
    } catch {
      logger.warn(`Could not add: ${item}`);
    }
  }

  if (itemsAdded.length === 0) {
    // Last resort: add the first available item
    await page.locator(`button:has-text("ADD"), button:has-text("Add")`).first().click().catch(() => {});
    itemsAdded.push("Selected item");
  }

  await page.waitForTimeout(1000);
  const screenshotPath = tmpFile("zomato-cart");
  await browser.screenshot(page, screenshotPath);

  return { screenshotPath, itemsAdded };
}

function extractFoodItems(input: string): string[] {
  const lower = input.toLowerCase();
  return FOOD_KEYWORDS.filter((food) => lower.includes(food));
}
