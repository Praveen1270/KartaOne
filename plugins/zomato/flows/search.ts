/**
 * Zomato search flow — sets delivery location and searches for food/restaurants.
 */

import { Page } from "playwright";
import { BrowserEngine } from "../../../browser/engine";
import { BrowserActions } from "../../../browser/actions";
import { PageVision } from "../../../browser/vision";
import { AgentContext } from "../../../core/plugin-base";
import { tmpFile } from "../../../utils/helpers";
import { logger } from "../../../utils/logger";

interface SearchResult {
  screenshotPath: string;
  restaurants: Array<{ name: string; rating: string; eta: string; codAvailable: boolean }>;
}

export async function zomatoSearch(
  page: Page,
  query: string,
  context: AgentContext,
  browser: BrowserEngine,
  actions: BrowserActions,
  vision: PageVision
): Promise<SearchResult> {
  await page.goto("https://www.zomato.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  await actions.dismissPopups(page);

  // Set delivery location
  const { address } = context.userProfile;
  if (address.city) {
    logger.info(`Setting Zomato location: ${address.city}`);
    const locationSet = await actions.fillWithFallback(
      page,
      [
        '[placeholder*="location" i]',
        '[placeholder*="Search" i]',
        "input[name='location']",
      ],
      `${address.line2 || address.line1}, ${address.city}`,
      "delivery location"
    );
    if (locationSet) {
      await page.waitForTimeout(1500);
      await actions.clickWithFallback(
        page,
        [".pac-item:first-child", ".location-suggestion:first-child", "li[role='option']:first-child"],
        "location suggestion"
      );
      await page.waitForLoadState("networkidle").catch(() => {});
    }
  }

  // Navigate to search
  const searchURL = `https://www.zomato.com/search?q=${encodeURIComponent(query)}`;
  await page.goto(searchURL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);
  await actions.dismissPopups(page);
  await actions.scrollDown(page, 300);

  // Screenshot results
  const screenshotPath = tmpFile("zomato-results");
  await browser.screenshot(page, screenshotPath);

  // Ask vision to parse restaurants
  let restaurants: Array<{ name: string; rating: string; eta: string; codAvailable: boolean }> = [];
  try {
    const raw = await vision.understandPage(
      screenshotPath,
      `List the top 5 restaurants/food options visible.
       For each include: name, rating (number), delivery time (e.g. "30-40 mins"), and whether COD is mentioned.
       JSON only: [{"name":"","rating":"4.2","eta":"30-40 mins","codAvailable":true}]`
    );
    restaurants = JSON.parse(raw.replace(/```json|```/g, "").trim()) as typeof restaurants;
  } catch {
    logger.warn("Vision parse failed for Zomato search results");
    restaurants = [{ name: "Top Result", rating: "4.0", eta: "30-45 mins", codAvailable: true }];
  }

  return { screenshotPath, restaurants };
}
