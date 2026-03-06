/**
 * Zomato Food Ordering Plugin.
 * Autonomously searches restaurants, adds items to cart, and checks out via COD.
 * Handles OTP login and multi-turn confirmation flows.
 */

import { Page } from "playwright";
import { PluginBase, PluginResult, AgentContext } from "../../core/plugin-base";
import { BrowserEngine } from "../../browser/engine";
import { PageVision } from "../../browser/vision";
import { BrowserActions } from "../../browser/actions";
import { zomatoSearch } from "./flows/search";
import { addToCart } from "./flows/cart";
import { checkoutCOD } from "./flows/checkout";
import { tmpFile } from "../../utils/helpers";
import { logger } from "../../utils/logger";

export class ZomatoPlugin extends PluginBase {
  name = "zomato";
  description = "Order food from Zomato with Cash on Delivery";
  triggers = [
    "zomato", "order food", "food delivery", "hungry",
    "order pizza", "order biryani", "order burger", "order chicken",
    "खाना order", "खाना मंगाओ", "zomato से", "खाना",
  ];

  private browser = BrowserEngine.getInstance();
  private vision = new PageVision();
  private actions = new BrowserActions(this.vision);

  // Stores the open page between multi-turn steps
  private activePage: Map<string, Page> = new Map();

  async run(input: string, context: AgentContext): Promise<PluginResult> {
    await context.sendMessage("🍕 Opening Zomato...");
    const page = await this.browser.getPage();
    this.activePage.set(context.userId, page);

    try {
      return await this.orderFlow(page, input, context);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("Zomato flow error:", err);
      await page.close();
      this.activePage.delete(context.userId);
      return this.error(`❌ Zomato ordering failed: ${msg}\n\nTry ordering directly at zomato.com`);
    }
  }

  private async orderFlow(
    page: Page,
    input: string,
    context: AgentContext
  ): Promise<PluginResult> {
    // Check login status, trigger OTP if needed
    await this.browser.loadUserSession(context.userId);
    const loggedIn = await this.checkLoginStatus(page);

    if (!loggedIn && process.env.ZOMATO_PHONE) {
      const loginResult = await this.initiateOTPLogin(page, context);
      if (loginResult.requiresHumanInput) return loginResult;
    }

    // Extract search query
    const query = extractSearchQuery(input);
    await context.sendMessage(`🔍 Searching for "${query}"...`);

    const { screenshotPath, restaurants } = await zomatoSearch(
      page, query, context, this.browser, this.actions, this.vision
    );

    await context.sendPhoto(screenshotPath, "🍽️ Here's what I found:");

    // Pick best restaurant with COD
    const restaurant =
      restaurants.find((r) => r.codAvailable) ?? restaurants[0];

    if (!restaurant) {
      return this.error("😔 No restaurants found. Try a different dish or check your location.");
    }

    await context.sendMessage(
      `⭐ Selected: *${restaurant.name}* — ${restaurant.rating}★ | ⏱ ${restaurant.eta}`
    );

    // Click into the restaurant
    try {
      await page.click(`text=${restaurant.name}`);
      await page.waitForLoadState("domcontentloaded");
    } catch {
      await page.locator("a[href*='order']").first().click().catch(() => {});
    }

    // Add items to cart
    await context.sendMessage("🛒 Adding items to your cart...");
    const { screenshotPath: cartPath, itemsAdded } = await addToCart(
      page, input, restaurant.name, this.browser, this.actions, this.vision
    );

    const cartDetails = await this.vision.extractOrderDetails(cartPath);
    await context.sendPhoto(cartPath);

    const itemList = (itemsAdded.length ? itemsAdded : cartDetails.items)
      .map((item, i) => `${i + 1}. ${item}`)
      .join("\n");

    const total = cartDetails.total || 0;
    const maxOrder = parseInt(process.env.MAX_ORDER_AMOUNT ?? "500", 10);

    if (total > maxOrder) {
      return this.needsInput(
        `🛒 *Order Summary from ${restaurant.name}:*\n\n${itemList}\n\n` +
        `💰 Total: ₹${total}\n` +
        `⏱ Delivery: ~${restaurant.eta}\n` +
        `💵 Payment: Cash on Delivery\n\n` +
        `⚠️ Total exceeds your ₹${maxOrder} limit. Reply *YES* to confirm or *NO* to cancel.`,
        { awaitingConfirmation: true, restaurantName: restaurant.name, total }
      );
    }

    return this.needsInput(
      `🛒 *Order Summary from ${restaurant.name}:*\n\n${itemList}\n\n` +
      `💰 Total: ₹${total || "TBD"}\n` +
      `⏱ Delivery: ~${restaurant.eta}\n` +
      `💵 Payment: Cash on Delivery\n\n` +
      `Reply *YES* to place order or *NO* to cancel`,
      { awaitingConfirmation: true, restaurantName: restaurant.name, total }
    );
  }

  async confirmAndPlace(
    _page: Page,
    context: AgentContext,
    state: Record<string, unknown>
  ): Promise<PluginResult> {
    const page = this.activePage.get(context.userId) ?? (await this.browser.getPage());

    try {
      await context.sendMessage("⏳ Placing your order on Zomato...");
      const result = await checkoutCOD(page, context, this.browser, this.actions, this.vision);

      // Save session cookies for next time
      await this.browser.saveSession(context.userId);

      const confirmPath = tmpFile("zomato-confirm-final");
      await this.browser.screenshot(page, confirmPath);
      await context.sendPhoto(confirmPath);

      return this.success(
        `🎉 *Order Placed on Zomato!*\n\n` +
        `📦 Order ID: ${result.orderId}\n` +
        `⏱ Delivery in: ${result.deliveryTime}\n` +
        `💵 Pay ₹${result.total || (state.total as number) || "—"} to delivery partner\n\n` +
        `Keep cash ready! 🛵`,
        { platform: "zomato", orderId: result.orderId, total: result.total }
      );
    } finally {
      await page.close();
      this.activePage.delete(context.userId);
    }
  }

  private async initiateOTPLogin(page: Page, context: AgentContext): Promise<PluginResult> {
    try {
      await page.goto("https://www.zomato.com/login", { waitUntil: "domcontentloaded" });
      await page.fill(
        '[name="mobile"], [type="tel"], [placeholder*="phone" i]',
        process.env.ZOMATO_PHONE!
      );
      await page.click('button[type="submit"]');
      await page.waitForTimeout(2000);
      logger.info("Zomato OTP requested");

      return this.needsInput(
        `📱 OTP sent to ${process.env.ZOMATO_PHONE}. Please reply with the OTP:`,
        { awaitingOTP: true, platform: "zomato" }
      );
    } catch (err) {
      logger.warn("Zomato login initiation failed:", err);
      return this.success(""); // Continue anyway — may already be on main page
    }
  }

  async submitOTP(otp: string, context: AgentContext): Promise<boolean> {
    const page = this.activePage.get(context.userId);
    if (!page) return false;
    try {
      await page.fill('[name="otp"], [placeholder*="OTP" i], [placeholder*="otp"]', otp);
      await page.click('button[type="submit"]');
      await page.waitForLoadState("networkidle");
      await this.browser.saveSession(context.userId);
      logger.info("Zomato OTP submitted");
      return true;
    } catch {
      return false;
    }
  }

  private async checkLoginStatus(page: Page): Promise<boolean> {
    await page.goto("https://www.zomato.com", { waitUntil: "domcontentloaded" });
    return page
      .isVisible('[data-testid="user-avatar"], .user-avatar, [aria-label="Account"]')
      .catch(() => false);
  }
}

function extractSearchQuery(input: string): string {
  const stopwords = new Set([
    "order", "from", "zomato", "me", "a", "the", "please", "cod",
    "cash", "delivery", "on", "get", "buy", "want",
  ]);
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !stopwords.has(w))
    .join(" ")
    .trim();
}
