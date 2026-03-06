/**
 * Reusable browser actions with built-in retry logic and vision fallbacks.
 * All actions log what they do and handle common failure modes gracefully.
 */

import { Page } from "playwright";
import { PageVision } from "./vision";
import { logger } from "../utils/logger";
import { sleep } from "../utils/helpers";

export class BrowserActions {
  constructor(private vision: PageVision) {}

  /** Click an element, falling back to a list of alternative selectors. */
  async clickWithFallback(
    page: Page,
    selectors: string[],
    description: string,
    timeout = 5000
  ): Promise<boolean> {
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout, state: "visible" });
        await page.click(selector);
        logger.info(`Clicked: ${description} (${selector})`);
        return true;
      } catch {
        // try next selector
      }
    }
    logger.warn(`Could not click ${description} with any selector`);
    return false;
  }

  /** Fill a text input, trying multiple selectors. */
  async fillWithFallback(
    page: Page,
    selectors: string[],
    value: string,
    description: string
  ): Promise<boolean> {
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 4000, state: "visible" });
        await page.fill(selector, "");
        await page.type(selector, value, { delay: 50 }); // Human-like typing
        logger.info(`Filled: ${description}`);
        return true;
      } catch {
        // try next
      }
    }
    logger.warn(`Could not fill ${description}`);
    return false;
  }

  /** Wait for navigation + optional selector to appear. */
  async waitForPage(page: Page, selector?: string, timeout = 15000): Promise<void> {
    await page.waitForLoadState("networkidle", { timeout });
    if (selector) {
      await page.waitForSelector(selector, { timeout }).catch(() => {});
    }
    await sleep(500);
  }

  /** Scroll down the page a bit to trigger lazy-loaded content. */
  async scrollDown(page: Page, pixels = 600): Promise<void> {
    await page.evaluate((px) => window.scrollBy(0, px), pixels);
    await sleep(800);
  }

  /** Close any popup/modal that appears (cookie consent, app download, etc.). */
  async dismissPopups(page: Page): Promise<void> {
    const popupSelectors = [
      "button:has-text('Close')",
      "button:has-text('×')",
      "[aria-label='Close']",
      ".modal-close",
      ".popup-close",
      "button:has-text('Maybe Later')",
      "button:has-text('Skip')",
      "button:has-text('Not Now')",
    ];

    for (const sel of popupSelectors) {
      await page.click(sel).catch(() => {});
    }
  }

  /** Extract text content of an element. */
  async getText(page: Page, selector: string): Promise<string> {
    try {
      return (await page.textContent(selector)) ?? "";
    } catch {
      return "";
    }
  }

  /** Check if element is visible on page. */
  async isVisible(page: Page, selector: string): Promise<boolean> {
    return await page.isVisible(selector).catch(() => false);
  }

  /**
   * Smart click: tries CSS selectors first, falls back to vision-guided click.
   * Vision fallback uses coordinate approximation based on described location.
   */
  async smartClick(
    page: Page,
    selectors: string[],
    elementDescription: string,
    screenshotPath: string
  ): Promise<boolean> {
    const directResult = await this.clickWithFallback(page, selectors, elementDescription);
    if (directResult) return true;

    logger.info(`Using vision fallback to find: ${elementDescription}`);
    const location = await this.vision.findElement(screenshotPath, elementDescription);

    if (!location.found) {
      logger.warn(`Vision could not find: ${elementDescription}`);
      return false;
    }

    // Map location description to viewport coordinates
    const viewport = page.viewportSize() ?? { width: 1366, height: 768 };
    const coords = this.locationToCoords(location.location ?? "center", viewport);
    await page.mouse.click(coords.x, coords.y);
    logger.info(`Vision click at (${coords.x}, ${coords.y}) for: ${elementDescription}`);
    return true;
  }

  private locationToCoords(
    location: string,
    viewport: { width: number; height: number }
  ): { x: number; y: number } {
    const { width, height } = viewport;
    const lower = location.toLowerCase();

    const x = lower.includes("left") ? width * 0.25 : lower.includes("right") ? width * 0.75 : width * 0.5;
    const y = lower.includes("top") ? height * 0.25 : lower.includes("bottom") ? height * 0.75 : height * 0.5;

    return { x: Math.round(x), y: Math.round(y) };
  }
}
