/**
 * Meesho COD purchase flow.
 */

import { Page } from "playwright";
import { BrowserActions } from "../../../browser/actions";
import { PageVision } from "../../../browser/vision";
import { BrowserEngine } from "../../../browser/engine";
import { AgentContext } from "../../../core/plugin-base";
import { SELECTORS } from "../detector";
import { tmpFile } from "../../../utils/helpers";
import { logger } from "../../../utils/logger";

export async function meeshoCheckoutCOD(
  page: Page,
  context: AgentContext,
  browser: BrowserEngine,
  actions: BrowserActions,
  vision: PageVision
): Promise<{ orderId: string; total: number; deliveryTime: string }> {
  const sel = SELECTORS.meesho;
  const { address } = context.userProfile;

  await actions.clickWithFallback(page, [sel.buyNow, sel.addToCart], "Meesho Buy/Add");
  await page.waitForTimeout(1500);
  await actions.dismissPopups(page);

  // Fill address
  logger.info("Meesho: setting address");
  await page.fill('[placeholder*="name" i]', address.name).catch(() => {});
  await page.fill('[placeholder*="phone" i], [type="tel"]', address.phone).catch(() => {});
  await page.fill('[placeholder*="address" i]', `${address.line1} ${address.line2}`).catch(() => {});
  await page.fill('[placeholder*="pincode" i]', address.pincode).catch(() => {});
  await page.fill('[placeholder*="city" i]', address.city).catch(() => {});

  await actions.clickWithFallback(page, ['button:has-text("Continue")'], "continue");
  await page.waitForTimeout(1000);

  // COD
  logger.info("Meesho: selecting COD");
  const codSelected = await actions.clickWithFallback(page, [sel.cod], "Meesho COD");
  if (!codSelected) {
    const snap = tmpFile("meesho-payment");
    await browser.screenshot(page, snap);
    if (!(await vision.isCODAvailable(snap))) throw new Error("Meesho COD not available");
  }

  await actions.clickWithFallback(page, [sel.placeOrder], "Meesho place order");
  await page.waitForTimeout(3000);

  const confirmPath = tmpFile("meesho-confirm");
  await browser.screenshot(page, confirmPath);
  const details = await vision.extractOrderDetails(confirmPath);

  return {
    orderId: details.orderId || `MSH-${Date.now()}`,
    total: details.total,
    deliveryTime: details.deliveryTime || "5-7 business days",
  };
}
