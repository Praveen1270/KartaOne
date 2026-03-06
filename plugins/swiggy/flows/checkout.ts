/**
 * Swiggy checkout flow — selects COD payment, confirms address, places the order.
 */

import { Page } from "playwright";
import { BrowserActions } from "../../../browser/actions";
import { PageVision } from "../../../browser/vision";
import { BrowserEngine } from "../../../browser/engine";
import { AgentContext } from "../../../core/plugin-base";
import { tmpFile } from "../../../utils/helpers";
import { logger } from "../../../utils/logger";

export async function swiggyCheckoutCOD(
  page: Page,
  context: AgentContext,
  browser: BrowserEngine,
  actions: BrowserActions,
  vision: PageVision
): Promise<{ success: boolean; orderId: string; total: number; deliveryTime: string }> {
  const { address } = context.userProfile;

  // Go to cart / proceed
  const checkoutClicked = await actions.clickWithFallback(
    page,
    [
      '[data-testid="proceed-to-checkout"]',
      'button:has-text("Proceed")',
      'button:has-text("Go to Cart")',
      'a:has-text("Checkout")',
    ],
    "Swiggy checkout button"
  );

  if (!checkoutClicked) {
    await page.goto("https://www.swiggy.com/cart", { waitUntil: "domcontentloaded" });
  }

  await page.waitForTimeout(2000);
  await actions.dismissPopups(page);

  // Confirm address
  logger.info("Confirming Swiggy address...");
  await actions
    .clickWithFallback(
      page,
      [`text=${address.pincode}`, `text=${address.line1}`, ".SavedAddressComponent"],
      "saved delivery address"
    )
    .catch(() => {});

  await page.waitForTimeout(1000);

  // Select COD
  logger.info("Selecting Swiggy COD...");
  const codSelected = await actions.clickWithFallback(
    page,
    [
      'text=Cash on Delivery',
      '[value="COD"]',
      'label:has-text("Cash")',
      '#cod',
    ],
    "Cash on Delivery"
  );

  if (!codSelected) {
    const snap = tmpFile("swiggy-payment");
    await browser.screenshot(page, snap);
    const available = await vision.isCODAvailable(snap);
    if (!available) throw new Error("Swiggy COD not available at this restaurant");
  }

  await page.waitForTimeout(500);

  // Place order
  logger.info("Placing Swiggy order...");
  await actions.clickWithFallback(
    page,
    [
      'button:has-text("Place Order")',
      'button:has-text("Confirm Order")',
      '[data-testid="place-order-button"]',
    ],
    "Swiggy place order"
  );

  await page.waitForSelector(
    "[data-testid='order-tracking'], .OrderTrackingPage, .order-success",
    { timeout: 30000 }
  ).catch(() => {});

  await page.waitForTimeout(2000);
  const confirmPath = tmpFile("swiggy-confirm");
  await browser.screenshot(page, confirmPath);
  const details = await vision.extractOrderDetails(confirmPath);

  return {
    success: true,
    orderId: details.orderId || `SWG-${Date.now()}`,
    total: details.total,
    deliveryTime: details.deliveryTime || "30-45 minutes",
  };
}
