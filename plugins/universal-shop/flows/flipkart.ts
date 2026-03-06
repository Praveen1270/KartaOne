/**
 * Flipkart COD purchase flow.
 */

import { Page } from "playwright";
import { BrowserActions } from "../../../browser/actions";
import { PageVision } from "../../../browser/vision";
import { BrowserEngine } from "../../../browser/engine";
import { AgentContext } from "../../../core/plugin-base";
import { SELECTORS } from "../detector";
import { tmpFile } from "../../../utils/helpers";
import { logger } from "../../../utils/logger";

export async function flipkartCheckoutCOD(
  page: Page,
  context: AgentContext,
  browser: BrowserEngine,
  actions: BrowserActions,
  vision: PageVision
): Promise<{ orderId: string; total: number; deliveryTime: string }> {
  const sel = SELECTORS.flipkart;
  const { address } = context.userProfile;

  logger.info("Flipkart: proceeding to checkout");

  // Try Buy Now first
  const buyNow = await actions.clickWithFallback(page, [sel.buyNow], "Flipkart Buy Now");
  if (!buyNow) {
    await actions.clickWithFallback(page, [sel.addToCart], "Flipkart Add to Cart");
    await page.goto("https://www.flipkart.com/checkout", { waitUntil: "domcontentloaded" });
  }

  await page.waitForTimeout(2000);
  await actions.dismissPopups(page);

  // Dismiss login popup if shown
  await page
    .click('button:has-text("Continue as guest"), ._2KpZ6l._2doB4z')
    .catch(() => {});

  // Address
  logger.info("Flipkart: confirming address");
  const savedAddr = await actions.clickWithFallback(
    page,
    [`text=${address.pincode}`, `text=${address.name}`, "._2nQGUK._3M9Sp8"],
    "Flipkart saved address"
  );

  if (!savedAddr) {
    await actions.clickWithFallback(page, ["._2I9Si8", 'button:has-text("Add New Address")'], "add new address");
    await page.fill('[placeholder*="Name" i]', address.name).catch(() => {});
    await page.fill('[placeholder*="10-digit" i], [type="tel"]', address.phone).catch(() => {});
    await page.fill('[placeholder*="Address" i]', `${address.line1} ${address.line2}`).catch(() => {});
    await page.fill('[placeholder*="Pincode" i]', address.pincode).catch(() => {});
    await actions.clickWithFallback(
      page,
      ['button:has-text("Save and Deliver Here")', '._2KpZ6l._3M9Sp8'],
      "save address"
    );
  }

  await actions.clickWithFallback(
    page,
    ['button:has-text("Continue")', '._3fsXHe'],
    "Flipkart continue"
  );
  await page.waitForTimeout(1500);

  // Select COD
  logger.info("Flipkart: selecting COD");
  const codSelected = await actions.clickWithFallback(
    page,
    [sel.cod, 'label:has-text("Cash on Delivery")'],
    "Flipkart COD"
  );

  if (!codSelected) {
    const snap = tmpFile("flipkart-payment");
    await browser.screenshot(page, snap);
    const available = await vision.isCODAvailable(snap);
    if (!available) throw new Error("Flipkart COD not available for this item");
  }

  await actions.clickWithFallback(
    page,
    ['button:has-text("Continue")', '._3fsXHe._2KpZ6l'],
    "continue to summary"
  );
  await page.waitForTimeout(1000);

  // Place order
  logger.info("Flipkart: placing order");
  await actions.clickWithFallback(page, [sel.placeOrder], "Flipkart place order");

  await page.waitForSelector("._1j_6jj, .order-success", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const confirmPath = tmpFile("flipkart-confirm");
  await browser.screenshot(page, confirmPath);
  const details = await vision.extractOrderDetails(confirmPath);

  return {
    orderId: details.orderId || `FK-${Date.now()}`,
    total: details.total,
    deliveryTime: details.deliveryTime || "2-5 business days",
  };
}
