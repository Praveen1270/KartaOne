/**
 * Stealth helpers — additional anti-bot techniques applied to pages.
 * Randomises behaviour to look more human to detection systems.
 */

import { Page } from "playwright";
import { sleep } from "../utils/helpers";

/** Add randomised mouse movements before clicking to mimic a real user. */
export async function humanMove(page: Page, x: number, y: number): Promise<void> {
  const steps = 5 + Math.floor(Math.random() * 5);
  await page.mouse.move(x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40, { steps });
  await sleep(80 + Math.random() * 120);
  await page.mouse.move(x, y, { steps: 3 });
}

/** Type text with randomised delay between keystrokes. */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector);
  for (const char of text) {
    await page.keyboard.type(char);
    await sleep(40 + Math.random() * 80);
  }
}

/** Random pause between actions to simulate reading time. */
export async function thinkPause(minMs = 500, maxMs = 1500): Promise<void> {
  await sleep(minMs + Math.random() * (maxMs - minMs));
}

/** Randomise viewport size slightly to avoid fingerprinting. */
export function randomViewport(): { width: number; height: number } {
  const widths = [1280, 1366, 1440, 1536];
  const heights = [720, 768, 800, 864];
  return {
    width: widths[Math.floor(Math.random() * widths.length)] ?? 1366,
    height: heights[Math.floor(Math.random() * heights.length)] ?? 768,
  };
}
