/**
 * Amazon India COD purchase flow.
 */

import { Page } from "playwright";
import { BrowserActions } from "../../../browser/actions";
import { PageVision } from "../../../browser/vision";
import { BrowserEngine } from "../../../browser/engine";
import { AgentContext } from "../../../core/plugin-base";
import { SELECTORS } from "../detector";
import { tmpFile } from "../../../utils/helpers";
import { logger } from "../../../utils/logger";

export async function amazonCheckoutCOD(
  page: Page,
  context: AgentContext,
  browser: BrowserEngine,
  actions: BrowserActions,
  vision: PageVision
): Promise<{ orderId: string; total: number; deliveryTime: string }> {
  const sel = SELECTORS.amazon;
  const { address } = context.userProfile;

  logger.info("Amazon: proceeding to checkout");

  // Click Buy Now or go to cart
  const buyNowClicked = await actions.clickWithFallback(page, [sel.buyNow], "Amazon Buy Now");
  if (!buyNowClicked) {
    await actions.clickWithFallback(page, [sel.addToCart], "Amazon Add to Cart");
    await page.goto("https://www.amazon.in/gp/cart/view.html", { waitUntil: "domcontentloaded" });
    await actions.clickWithFallback(
      page,
      ['input[name="proceedToRetailCheckout"]', 'a:has-text("Proceed to Buy")'],
      "Amazon proceed to checkout"
    );
  }

  await page.waitForTimeout(2000);
  await actions.dismissPopups(page);

  // Address selection
  logger.info("Amazon: setting delivery address");
  const addressSelected = await actions.clickWithFallback(
    page,
    [`text=${address.pincode}`, `text=${address.name}`, ".displayAddressDiv"],
    "Amazon saved address"
  );

  if (!addressSelected) {
    await actions.fillWithFallback(
      page,
      ['[name="enterNewAddressFullName"]', '[placeholder*="name" i]'],
      address.name,
      "recipient name"
    );
    await actions.fillWithFallback(
      page,
      ['[name="enterNewAddressPhoneNumber"]', '[type="tel"]'],
      address.phone,
      "phone"
    );
    await actions.fillWithFallback(
      page,
      ['[name="enterNewAddressLine1"]'],
      address.line1,
      "address line 1"
    );
    await actions.fillWithFallback(
      page,
      ['[name="enterNewAddressPostalCode"]'],
      address.pincode,
      "pincode"
    );
    await actions.clickWithFallback(
      page,
      ['input[name="shipToThisAddress"]', 'button:has-text("Use this address")'],
      "use address"
    );
  }

  await page.waitForTimeout(1500);

  // Select COD
  logger.info("Amazon: selecting COD");
  const codSelected = await actions.clickWithFallback(
    page,
    [sel.cod, 'input[value="COD"]', 'label:has-text("Cash on Delivery")'],
    "Amazon COD"
  );

  if (!codSelected) {
    const snap = tmpFile("amazon-payment");
    await browser.screenshot(page, snap);
    const available = await vision.isCODAvailable(snap);
    if (!available) throw new Error("Amazon COD not available for this item");
  }

  await page.waitForTimeout(500);
  await actions.clickWithFallback(
    page,
    ['input[name="continue"]', 'input[name="placeYourOrder1"]'],
    "Amazon continue"
  );
  await page.waitForTimeout(1000);

  // Place order
  logger.info("Amazon: placing order");
  await actions.clickWithFallback(
    page,
    [sel.placeOrder, 'input[name="placeYourOrder1"]'],
    "Amazon place order"
  );

  await page.waitForSelector(".order-Confirmation, #thanksPageSection", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const confirmPath = tmpFile("amazon-confirm");
  await browser.screenshot(page, confirmPath);
  const details = await vision.extractOrderDetails(confirmPath);

  return {
    orderId: details.orderId || `AMZ-${Date.now()}`,
    total: details.total,
    deliveryTime: details.deliveryTime || "3-5 business days",
  };
}
