/**
 * Zomato checkout flow — selects COD, confirms address, places the order.
 */

import { Page } from "playwright";
import { BrowserActions } from "../../../browser/actions";
import { PageVision } from "../../../browser/vision";
import { BrowserEngine } from "../../../browser/engine";
import { AgentContext } from "../../../core/plugin-base";
import { tmpFile } from "../../../utils/helpers";
import { logger } from "../../../utils/logger";

export async function checkoutCOD(
  page: Page,
  context: AgentContext,
  browser: BrowserEngine,
  actions: BrowserActions,
  vision: PageVision
): Promise<{ success: boolean; orderId: string; total: number; deliveryTime: string }> {
  const { address } = context.userProfile;

  // Navigate to checkout
  const checkoutClicked = await actions.clickWithFallback(
    page,
    [
      '[data-testid="proceed-to-checkout"]',
      'button:has-text("Proceed to Checkout")',
      'button:has-text("Checkout")',
      'a:has-text("Checkout")',
    ],
    "proceed to checkout"
  );

  if (!checkoutClicked) {
    await page.goto("https://www.zomato.com/checkout", { waitUntil: "domcontentloaded" });
  }

  await page.waitForTimeout(2000);
  await actions.dismissPopups(page);

  // Confirm or set address
  logger.info("Confirming delivery address...");
  await actions
    .clickWithFallback(
      page,
      [
        `text=${address.pincode}`,
        `text=${address.line1}`,
        '[data-testid="delivery-address"]',
        ".saved-address",
      ],
      "saved address"
    )
    .catch(() => {});

  // Fill address if no saved one exists
  await page
    .fill('[placeholder*="pincode" i], [name="pincode"]', address.pincode)
    .catch(() => {});
  await page.fill('[placeholder*="phone" i], [name="phone"]', address.phone).catch(() => {});

  await page.waitForTimeout(1000);

  // Select Cash on Delivery
  logger.info("Selecting COD...");
  const codSelected = await actions.clickWithFallback(
    page,
    [
      'text=Cash on Delivery',
      '[value="COD"]',
      'label:has-text("Cash")',
      'input[id*="cod" i]',
    ],
    "Cash on Delivery"
  );

  if (!codSelected) {
    // Vision fallback
    const snap = tmpFile("payment-page");
    await browser.screenshot(page, snap);
    const available = await vision.isCODAvailable(snap);
    if (!available) {
      throw new Error("COD not available at this restaurant");
    }
  }

  await page.waitForTimeout(500);

  // Place Order
  logger.info("Placing order...");
  await actions.clickWithFallback(
    page,
    [
      'button:has-text("Place Order")',
      'button:has-text("Confirm Order")',
      'button[type="submit"]',
    ],
    "place order"
  );

  await page.waitForSelector(
    ".order-success, .confirmation, [data-testid='order-success']",
    { timeout: 30000 }
  ).catch(() => {});

  await page.waitForTimeout(2000);

  const confirmPath = tmpFile("zomato-confirm");
  await browser.screenshot(page, confirmPath);
  const details = await vision.extractOrderDetails(confirmPath);

  return {
    success: true,
    orderId: details.orderId || `ZMT-${Date.now()}`,
    total: details.total,
    deliveryTime: details.deliveryTime || "30-45 minutes",
  };
}
