/**
 * Singleton Playwright browser manager.
 * Launches a stealth Chromium instance shared across all plugins.
 * Applies anti-bot scripts to avoid detection on Zomato, Swiggy, Amazon, etc.
 */

import { Browser, BrowserContext, Page, chromium } from "playwright";
import { logger } from "../utils/logger";
import * as path from "path";
import * as fs from "fs";

const SESSION_DIR = path.join(process.cwd(), ".sessions");

export class BrowserEngine {
  private static instance: BrowserEngine;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  static getInstance(): BrowserEngine {
    if (!BrowserEngine.instance) {
      BrowserEngine.instance = new BrowserEngine();
    }
    return BrowserEngine.instance;
  }

  async getPage(): Promise<Page> {
    if (!this.browser || !this.browser.isConnected()) {
      await this.launch();
    }
    const page = await this.context!.newPage();
    await this.applyStealthScripts(page);
    return page;
  }

  private async launch(): Promise<void> {
    logger.info("Launching stealth Chromium...");
    fs.mkdirSync(SESSION_DIR, { recursive: true });

    this.browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--window-size=1366,768",
      ],
    });

    this.context = await this.browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      viewport: { width: 1366, height: 768 },
      locale: "en-IN",
      timezoneId: "Asia/Kolkata",
      geolocation: { latitude: 12.9716, longitude: 77.5946 }, // Bangalore default
      permissions: ["geolocation"],
      extraHTTPHeaders: {
        "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
      },
      storageState: this.loadSession(),
    });

    this.context.on("page", (page) => {
      page.on("dialog", async (dialog) => {
        await dialog.dismiss();
      });
    });

    logger.info("Browser launched");
  }

  private applyStealthScripts = async (page: Page): Promise<void> => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "plugins", {
        get: () => [
          { name: "Chrome PDF Plugin" },
          { name: "Chrome PDF Viewer" },
          { name: "Native Client" },
        ],
      });
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-IN", "en", "hi"],
      });
      (window as Window & { chrome?: { runtime: Record<string, unknown> } }).chrome = {
        runtime: {},
      };
    });
  };

  async screenshot(page: Page, filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: filePath, fullPage: false });
    logger.info(`Screenshot saved: ${filePath}`);
  }

  async saveSession(userId: string): Promise<void> {
    if (!this.context) return;
    const sessionPath = path.join(SESSION_DIR, `${userId}.json`);
    await this.context.storageState({ path: sessionPath });
    logger.info(`Session saved for user ${userId}`);
  }

  private loadSession(): { cookies: never[]; origins: never[] } | undefined {
    return undefined; // Sessions loaded per-user later
  }

  async loadUserSession(userId: string): Promise<void> {
    const sessionPath = path.join(SESSION_DIR, `${userId}.json`);
    if (fs.existsSync(sessionPath) && this.context) {
      const state = JSON.parse(fs.readFileSync(sessionPath, "utf-8")) as {
        cookies: Parameters<BrowserContext["addCookies"]>[0];
      };
      if (state.cookies) {
        await this.context.addCookies(state.cookies);
      }
    }
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    logger.info("Browser closed");
  }
}
