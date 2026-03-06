/**
 * Swiggy Food Ordering Plugin.
 * Mirrors the Zomato plugin architecture for Swiggy.com.
 */

import { Page } from "playwright";
import { PluginBase, PluginResult, AgentContext } from "../../core/plugin-base";
import { BrowserEngine } from "../../browser/engine";
import { PageVision } from "../../browser/vision";
import { BrowserActions } from "../../browser/actions";
import { swiggySearch } from "./flows/search";
import { swiggyAddToCart } from "./flows/cart";
import { swiggyCheckoutCOD } from "./flows/checkout";
import { tmpFile } from "../../utils/helpers";
import { logger } from "../../utils/logger";

export class SwiggyPlugin extends PluginBase {
  name = "swiggy";
  description = "Order food from Swiggy with Cash on Delivery";
  triggers = [
    "swiggy", "swiggy se", "swiggy से",
    "order from swiggy", "food from swiggy",
  ];

  private browser = BrowserEngine.getInstance();
  private vision = new PageVision();
  private actions = new BrowserActions(this.vision);
  private activePage: Map<string, Page> = new Map();

  async run(input: string, context: AgentContext): Promise<PluginResult> {
    await context.sendMessage("🛵 Opening Swiggy...");
    const page = await this.browser.getPage();
    this.activePage.set(context.userId, page);

    try {
      return await this.orderFlow(page, input, context);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Swiggy flow error:", err);
      await page.close();
      this.activePage.delete(context.userId);
      return this.error(`❌ Swiggy ordering failed: ${msg}\n\nTry ordering at swiggy.com directly.`);
    }
  }

  private async orderFlow(page: Page, input: string, context: AgentContext): Promise<PluginResult> {
    await this.browser.loadUserSession(context.userId);
    const loggedIn = await this.checkLoginStatus(page);

    if (!loggedIn && process.env.SWIGGY_PHONE) {
      const loginResult = await this.initiateOTPLogin(page, context);
      if (loginResult.requiresHumanInput) return loginResult;
    }

    const query = extractSearchQuery(input);
    await context.sendMessage(`🔍 Searching Swiggy for "${query}"...`);

    const { screenshotPath, restaurants } = await swiggySearch(
      page, query, context, this.browser, this.actions, this.vision
    );

    await context.sendPhoto(screenshotPath, "🍽️ Swiggy results:");

    const restaurant = restaurants.find((r) => r.codAvailable) ?? restaurants[0];
    if (!restaurant) {
      return this.error("😔 No Swiggy restaurants found. Try a different dish or check your location.");
    }

    await context.sendMessage(
      `⭐ Selected: *${restaurant.name}* — ${restaurant.rating}★ | ⏱ ${restaurant.eta}`
    );

    try {
      await page.click(`text=${restaurant.name}`);
      await page.waitForLoadState("domcontentloaded");
    } catch {
      await page.locator("a[href*='restaurant'], a[href*='menu']").first().click().catch(() => {});
    }

    await context.sendMessage("🛒 Adding to cart...");
    const { screenshotPath: cartPath, itemsAdded } = await swiggyAddToCart(
      page, input, this.browser, this.actions, this.vision
    );

    const cartDetails = await this.vision.extractOrderDetails(cartPath);
    await context.sendPhoto(cartPath);

    const itemList = (itemsAdded.length ? itemsAdded : cartDetails.items)
      .map((it, i) => `${i + 1}. ${it}`)
      .join("\n");

    return this.needsInput(
      `🛒 *Swiggy Order Summary — ${restaurant.name}:*\n\n${itemList}\n\n` +
      `💰 Total: ₹${cartDetails.total || "TBD"}\n` +
      `⏱ Delivery: ~${restaurant.eta}\n` +
      `💵 Payment: Cash on Delivery\n\n` +
      `Reply *YES* to place order or *NO* to cancel`,
      { awaitingConfirmation: true, restaurantName: restaurant.name, total: cartDetails.total }
    );
  }

  async confirmAndPlace(
    _page: Page,
    context: AgentContext,
    state: Record<string, unknown>
  ): Promise<PluginResult> {
    const page = this.activePage.get(context.userId) ?? (await this.browser.getPage());
    try {
      await context.sendMessage("⏳ Placing your Swiggy order...");
      const result = await swiggyCheckoutCOD(page, context, this.browser, this.actions, this.vision);
      await this.browser.saveSession(context.userId);

      const confirmPath = tmpFile("swiggy-confirm-final");
      await this.browser.screenshot(page, confirmPath);
      await context.sendPhoto(confirmPath);

      return this.success(
        `🎉 *Order Placed on Swiggy!*\n\n` +
        `📦 Order ID: ${result.orderId}\n` +
        `⏱ Delivery in: ${result.deliveryTime}\n` +
        `💵 Pay ₹${result.total || (state.total as number) || "—"} to delivery partner\n\n` +
        `Keep cash ready! 🛵`,
        { platform: "swiggy", orderId: result.orderId, total: result.total }
      );
    } finally {
      await page.close();
      this.activePage.delete(context.userId);
    }
  }

  async submitOTP(otp: string, context: AgentContext): Promise<boolean> {
    const page = this.activePage.get(context.userId);
    if (!page) return false;
    try {
      await page.fill('[placeholder*="OTP" i], [name="otp"]', otp);
      await page.click('button[type="submit"]');
      await page.waitForLoadState("networkidle");
      await this.browser.saveSession(context.userId);
      return true;
    } catch {
      return false;
    }
  }

  private async initiateOTPLogin(page: Page, context: AgentContext): Promise<PluginResult> {
    try {
      await page.goto("https://www.swiggy.com", { waitUntil: "domcontentloaded" });
      await page.click('button:has-text("Sign In"), [data-testid="login-btn"]').catch(() => {});
      await page.waitForTimeout(1000);
      await page.fill('[placeholder*="phone" i], [type="tel"]', process.env.SWIGGY_PHONE!);
      await page.click('button:has-text("Continue"), button[type="submit"]');
      await page.waitForTimeout(2000);
      return this.needsInput(
        `📱 OTP sent to ${process.env.SWIGGY_PHONE}. Please reply with the OTP:`,
        { awaitingOTP: true, platform: "swiggy" }
      );
    } catch {
      return this.success("");
    }
  }

  private async checkLoginStatus(page: Page): Promise<boolean> {
    await page.goto("https://www.swiggy.com", { waitUntil: "domcontentloaded" });
    return page.isVisible('[data-testid="user-icon"], .user-icon').catch(() => false);
  }
}

function extractSearchQuery(input: string): string {
  const stopwords = new Set([
    "order", "from", "swiggy", "me", "a", "the", "please", "cod",
    "cash", "delivery", "on", "get", "want",
  ]);
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !stopwords.has(w))
    .join(" ")
    .trim();
}
