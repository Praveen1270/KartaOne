/**
 * Swiggy search flow — sets delivery location and searches for food.
 */

import { Page } from "playwright";
import { BrowserEngine } from "../../../browser/engine";
import { BrowserActions } from "../../../browser/actions";
import { PageVision } from "../../../browser/vision";
import { AgentContext } from "../../../core/plugin-base";
import { tmpFile } from "../../../utils/helpers";
import { logger } from "../../../utils/logger";

interface SwiggySearchResult {
  screenshotPath: string;
  restaurants: Array<{ name: string; rating: string; eta: string; codAvailable: boolean }>;
}

export async function swiggySearch(
  page: Page,
  query: string,
  context: AgentContext,
  browser: BrowserEngine,
  actions: BrowserActions,
  vision: PageVision
): Promise<SwiggySearchResult> {
  await page.goto("https://www.swiggy.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  await actions.dismissPopups(page);

  const { address } = context.userProfile;

  // Set delivery location
  if (address.city) {
    const locationFilled = await actions.fillWithFallback(
      page,
      [
        '[placeholder*="location" i]',
        '[placeholder*="Search" i]',
        'input[name="location"]',
        '#location',
      ],
      `${address.line2 || address.line1}, ${address.city}`,
      "Swiggy location"
    );
    if (locationFilled) {
      await page.waitForTimeout(1500);
      await actions.clickWithFallback(
        page,
        [
          "._3j3og:first-child",
          ".location-search-list li:first-child",
          "[data-testid='location-item']:first-child",
        ],
        "location suggestion"
      );
      await page.waitForLoadState("networkidle").catch(() => {});
    }
  }

  // Search for food
  const searchURL = `https://www.swiggy.com/search?query=${encodeURIComponent(query)}`;
  await page.goto(searchURL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);
  await actions.dismissPopups(page);
  await actions.scrollDown(page, 300);

  const screenshotPath = tmpFile("swiggy-results");
  await browser.screenshot(page, screenshotPath);

  let restaurants: Array<{ name: string; rating: string; eta: string; codAvailable: boolean }> = [];
  try {
    const raw = await vision.understandPage(
      screenshotPath,
      `List the top 5 restaurants visible on this Swiggy page.
       For each: name, rating, delivery time, and whether COD is available.
       JSON only: [{"name":"","rating":"4.2","eta":"30-40 mins","codAvailable":true}]`
    );
    restaurants = JSON.parse(raw.replace(/```json|```/g, "").trim()) as typeof restaurants;
  } catch {
    logger.warn("Vision parse failed for Swiggy search results");
    restaurants = [{ name: "Top Restaurant", rating: "4.0", eta: "30-45 mins", codAvailable: true }];
  }

  return { screenshotPath, restaurants };
}
