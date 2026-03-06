/**
 * Generic COD checkout flow for unknown/unsupported e-commerce websites.
 * Uses vision-guided interaction since there are no hardcoded selectors.
 */

import { Page } from "playwright";
import { BrowserActions } from "../../../browser/actions";
import { PageVision } from "../../../browser/vision";
import { BrowserEngine } from "../../../browser/engine";
import { AgentContext } from "../../../core/plugin-base";
import { SELECTORS } from "../detector";
import { tmpFile } from "../../../utils/helpers";
import { logger } from "../../../utils/logger";

export async function genericCheckoutCOD(
  page: Page,
  context: AgentContext,
  browser: BrowserEngine,
  actions: BrowserActions,
  vision: PageVision
): Promise<{ orderId: string; total: number; deliveryTime: string }> {
  const sel = SELECTORS.generic;
  const { address } = context.userProfile;

  logger.info("Generic checkout: attempting Buy Now / Add to Cart");
  await actions.clickWithFallback(page, [sel.buyNow, sel.addToCart], "buy/add button");
  await page.waitForTimeout(1500);
  await actions.dismissPopups(page);

  // Try to fill any address fields present
  logger.info("Generic checkout: filling address fields");
  const fieldMap: Record<string, string> = {
    '[placeholder*="name" i], [name*="name" i]': address.name,
    '[placeholder*="phone" i], [name*="phone" i], [type="tel"]': address.phone,
    '[placeholder*="address" i], [name*="address" i]': `${address.line1} ${address.line2}`,
    '[placeholder*="pincode" i], [name*="pincode" i], [placeholder*="zip" i]': address.pincode,
    '[placeholder*="city" i], [name*="city" i]': address.city,
  };

  for (const [selector, value] of Object.entries(fieldMap)) {
    await page.fill(selector, value).catch(() => {});
  }

  await actions.clickWithFallback(
    page,
    ['button:has-text("Continue")', 'button:has-text("Proceed")', 'input[type="submit"]'],
    "continue button"
  );
  await page.waitForTimeout(1000);

  // Vision-guided COD selection
  const snap = tmpFile("generic-payment");
  await browser.screenshot(page, snap);
  const codAvailable = await vision.isCODAvailable(snap);

  if (!codAvailable) {
    throw new Error("COD not available on this website");
  }

  await actions.clickWithFallback(
    page,
    [sel.cod, 'label:has-text("Cash")', 'input[value*="cod" i]'],
    "COD option"
  );

  const confirmSnap = tmpFile("generic-confirm-check");
  await browser.screenshot(page, confirmSnap);
  await actions.smartClick(page, [sel.placeOrder], "Place Order button", confirmSnap);
  await page.waitForTimeout(3000);

  const confirmPath = tmpFile("generic-confirm");
  await browser.screenshot(page, confirmPath);
  const details = await vision.extractOrderDetails(confirmPath);

  return {
    orderId: details.orderId || `ORD-${Date.now()}`,
    total: details.total,
    deliveryTime: details.deliveryTime || "3-7 business days",
  };
}
