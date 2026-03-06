/**
 * Universal Shopping Plugin.
 * Buys any product from any Indian e-commerce website using Cash on Delivery.
 * Has dedicated flows for Amazon/Flipkart/Meesho + vision-guided generic fallback.
 */

import { Page } from "playwright";
import { PluginBase, PluginResult, AgentContext } from "../../core/plugin-base";
import { BrowserEngine } from "../../browser/engine";
import { PageVision } from "../../browser/vision";
import { BrowserActions } from "../../browser/actions";
import {
  SiteType,
  detectSite,
  getSiteURL,
  getSiteName,
  SELECTORS,
} from "./detector";
import { amazonCheckoutCOD } from "./flows/amazon";
import { flipkartCheckoutCOD } from "./flows/flipkart";
import { meeshoCheckoutCOD } from "./flows/meesho";
import { genericCheckoutCOD } from "./flows/generic";
import { tmpFile } from "../../utils/helpers";
import { logger } from "../../utils/logger";

interface ProductResult {
  name: string;
  price: number;
  rating: string;
  codAvailable: boolean;
  url: string;
  position: number;
}

export class UniversalShopPlugin extends PluginBase {
  name = "universal_shop";
  description = "Buy any product from any Indian website with Cash on Delivery";
  triggers = [
    "buy", "purchase", "shop", "get me",
    "amazon", "flipkart", "meesho", "myntra", "snapdeal",
    "cod", "cash on delivery", "खरीदना", "खरीदो", "मंगाओ",
    "order earphones", "order phone", "order laptop", "order shoes",
    "order clothes", "order mobile",
  ];

  private browser = BrowserEngine.getInstance();
  private vision = new PageVision();
  private actions = new BrowserActions(this.vision);
  private activePage: Map<string, Page> = new Map();
  private activeProduct: Map<string, ProductResult & { site: SiteType }> = new Map();

  async run(input: string, context: AgentContext): Promise<PluginResult> {
    const site = detectSite(input);
    const product = extractProduct(input);

    await context.sendMessage(`🛒 Searching for *"${product}"* on ${getSiteName(site)}...`);

    const page = await this.browser.getPage();
    this.activePage.set(context.userId, page);

    try {
      const url = getSiteURL(site, product);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2000);
      await this.actions.dismissPopups(page);

      // Screenshot results
      const resultsPath = tmpFile("shop-results");
      await this.browser.screenshot(page, resultsPath);
      await context.sendPhoto(resultsPath, `🔍 Results on ${getSiteName(site)}:`);

      // Vision: find best COD product
      const bestProduct = await this.selectBestProduct(page, resultsPath, product, site);
      this.activeProduct.set(context.userId, { ...bestProduct, site });

      if (!bestProduct.codAvailable) {
        return this.error(
          `😔 Cash on Delivery is not available for this product on ${getSiteName(site)}.\n` +
          `Try another platform?`
        );
      }

      // Navigate to product page
      await page.goto(bestProduct.url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);

      const productPath = tmpFile("shop-product");
      await this.browser.screenshot(page, productPath);
      await context.sendPhoto(productPath);

      return this.needsInput(
        `📦 *${bestProduct.name}*\n\n` +
        `💰 Price: ₹${bestProduct.price || "—"}\n` +
        `⭐ Rating: ${bestProduct.rating}\n` +
        `💵 Payment: Cash on Delivery\n` +
        `📍 Delivery to: ${context.userProfile.address.city}\n\n` +
        `Reply *YES* to buy or *NO* to cancel`,
        { awaitingConfirmation: true, product: bestProduct, site }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await page.close();
      this.activePage.delete(context.userId);
      return this.error(`❌ Shopping failed: ${msg}`);
    }
  }

  async confirmAndPlace(
    _page: Page,
    context: AgentContext,
    state: Record<string, unknown>
  ): Promise<PluginResult> {
    const page = this.activePage.get(context.userId) ?? (await this.browser.getPage());
    const productInfo = this.activeProduct.get(context.userId);
    const site = (state.site as SiteType) ?? productInfo?.site ?? "flipkart";

    try {
      await context.sendMessage(`⏳ Placing your order on ${getSiteName(site)}...`);

      let result: { orderId: string; total: number; deliveryTime: string };

      switch (site) {
        case "amazon":
          result = await amazonCheckoutCOD(page, context, this.browser, this.actions, this.vision);
          break;
        case "flipkart":
          result = await flipkartCheckoutCOD(page, context, this.browser, this.actions, this.vision);
          break;
        case "meesho":
          result = await meeshoCheckoutCOD(page, context, this.browser, this.actions, this.vision);
          break;
        default:
          result = await genericCheckoutCOD(page, context, this.browser, this.actions, this.vision);
      }

      await this.browser.saveSession(context.userId);

      const confirmPath = tmpFile("shop-confirm-final");
      await this.browser.screenshot(page, confirmPath);
      await context.sendPhoto(confirmPath);

      return this.success(
        `🎉 *Order Placed on ${getSiteName(site)}!*\n\n` +
        `📦 Order ID: ${result.orderId}\n` +
        `💰 Pay ₹${result.total || (productInfo?.price ?? "—")} on delivery\n` +
        `📦 Estimated delivery: ${result.deliveryTime}\n\n` +
        `Keep cash ready for the delivery person! 💵`,
        { platform: site, orderId: result.orderId, total: result.total }
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.error(`❌ Order failed: ${msg}`);
    } finally {
      await page.close();
      this.activePage.delete(context.userId);
      this.activeProduct.delete(context.userId);
    }
  }

  private async selectBestProduct(
    page: Page,
    screenshotPath: string,
    query: string,
    site: SiteType
  ): Promise<ProductResult> {
    const sel = SELECTORS[site];

    try {
      const raw = await this.vision.understandPage(
        screenshotPath,
        `I searched for "${query}" on an e-commerce site.
         List the top 3 products visible with name, price (number only), rating, whether COD is available, and position (1/2/3).
         JSON only: [{"name":"","price":999,"rating":"4.2","codAvailable":true,"position":1}]`
      );

      const products = JSON.parse(raw.replace(/```json|```/g, "").trim()) as ProductResult[];
      const best = products.find((p) => p.codAvailable) ?? products[0];
      if (!best) throw new Error("No products parsed from vision");

      // Click the product to get its URL
      const productCard = page.locator(sel.productCard).nth(best.position - 1);
      await productCard.click().catch(() =>
        page.locator("a").filter({ hasText: best.name }).first().click()
      );
      await page.waitForLoadState("domcontentloaded");

      return { ...best, url: page.url() };
    } catch {
      logger.warn("Vision product selection failed — using first result");
      await page.locator(sel.productCard).first().click().catch(() => {});
      await page.waitForLoadState("domcontentloaded");
      return {
        name: query,
        price: 0,
        rating: "N/A",
        codAvailable: true,
        url: page.url(),
        position: 1,
      };
    }
  }
}

function extractProduct(input: string): string {
  const stopwords = new Set([
    "buy", "order", "get", "me", "a", "an", "the", "from",
    "amazon", "flipkart", "meesho", "myntra", "snapdeal",
    "cod", "cash", "delivery", "on", "please", "want",
  ]);
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !stopwords.has(w))
    .join(" ")
    .trim();
}
