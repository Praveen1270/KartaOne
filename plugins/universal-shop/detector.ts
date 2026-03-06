/**
 * Site detector — identifies which e-commerce platform the user is targeting.
 */

export type SiteType = "amazon" | "flipkart" | "meesho" | "myntra" | "snapdeal" | "generic";

const SITE_PATTERNS: Array<{ pattern: RegExp; site: SiteType }> = [
  { pattern: /amazon\.in|amazon/i, site: "amazon" },
  { pattern: /flipkart/i, site: "flipkart" },
  { pattern: /meesho/i, site: "meesho" },
  { pattern: /myntra/i, site: "myntra" },
  { pattern: /snapdeal/i, site: "snapdeal" },
];

export function detectSite(input: string): SiteType {
  for (const { pattern, site } of SITE_PATTERNS) {
    if (pattern.test(input)) return site;
  }
  return "flipkart"; // Default for India
}

export function getSiteURL(site: SiteType, product: string): string {
  const encoded = encodeURIComponent(product);
  const urls: Record<SiteType, string> = {
    amazon: `https://www.amazon.in/s?k=${encoded}`,
    flipkart: `https://www.flipkart.com/search?q=${encoded}`,
    meesho: `https://meesho.com/search?q=${encoded}`,
    myntra: `https://www.myntra.com/${encoded.replace(/%20/g, "-")}`,
    snapdeal: `https://www.snapdeal.com/search?keyword=${encoded}`,
    generic: `https://www.flipkart.com/search?q=${encoded}`,
  };
  return urls[site];
}

export function getCheckoutURL(site: SiteType): string {
  const urls: Record<SiteType, string> = {
    amazon: "https://www.amazon.in/gp/cart/view.html",
    flipkart: "https://www.flipkart.com/checkout",
    meesho: "https://meesho.com/checkout",
    myntra: "https://www.myntra.com/checkout/bag",
    snapdeal: "https://www.snapdeal.com/checkout/cart",
    generic: "/cart",
  };
  return urls[site];
}

export function getSiteName(site: SiteType): string {
  const names: Record<SiteType, string> = {
    amazon: "Amazon India",
    flipkart: "Flipkart",
    meesho: "Meesho",
    myntra: "Myntra",
    snapdeal: "Snapdeal",
    generic: "Flipkart",
  };
  return names[site];
}

export const SELECTORS: Record<SiteType, Record<string, string>> = {
  amazon: {
    search: "#twotabsearchtextbox",
    searchBtn: "#nav-search-submit-button",
    productCard: '[data-component-type="s-search-result"]',
    addToCart: "#add-to-cart-button",
    buyNow: "#buy-now-button",
    cod: '[data-testid="cod-option"], input[value*="cod" i]',
    placeOrder: "#submitOrderButtonId, input[name='placeYourOrder1']",
    addressSection: "#addressBookWidgetV2EnterANewAddress",
  },
  flipkart: {
    search: 'input[title="Search for Products, Brands and More"]',
    searchBtn: 'button[type="submit"]',
    productCard: "._1AtVbE, [data-id]",
    addToCart: 'button:has-text("ADD TO CART")',
    buyNow: 'button:has-text("BUY NOW")',
    cod: 'label:has-text("Cash on Delivery"), input[value="COD"]',
    placeOrder: 'button:has-text("PLACE ORDER")',
    addressSection: "._3MbZW5",
  },
  meesho: {
    search: 'input[placeholder*="Search" i]',
    searchBtn: 'button[type="submit"]',
    productCard: ".ProductCard, [class*='product']",
    addToCart: 'button:has-text("Add to Cart")',
    buyNow: 'button:has-text("Buy Now")',
    cod: 'label:has-text("Cash on Delivery")',
    placeOrder: 'button:has-text("Place Order")',
    addressSection: ".AddressForm",
  },
  myntra: {
    search: 'input[placeholder*="search" i]',
    searchBtn: 'button[type="submit"]',
    productCard: ".product-base",
    addToCart: 'button:has-text("ADD TO BAG")',
    buyNow: 'button:has-text("BUY NOW")',
    cod: 'label:has-text("Cash On Delivery")',
    placeOrder: 'button:has-text("PLACE ORDER")',
    addressSection: ".address-form",
  },
  snapdeal: {
    search: '#inputValEnter, input[name="keyword"]',
    searchBtn: 'button[type="submit"]',
    productCard: ".product-tuple-listing",
    addToCart: 'button:has-text("Add to Cart")',
    buyNow: 'button:has-text("Buy Now")',
    cod: 'label:has-text("Cash on Delivery")',
    placeOrder: 'button:has-text("Place Order")',
    addressSection: ".addressForm",
  },
  generic: {
    search: 'input[type="search"], input[name="q"], input[placeholder*="search" i]',
    searchBtn: 'button[type="submit"]',
    productCard: 'article, .product, [class*="product-card"]',
    addToCart: 'button:has-text("Add to Cart"), button:has-text("Add to Bag")',
    buyNow: 'button:has-text("Buy Now")',
    cod: 'label:has-text("Cash"), input[value*="cod" i]',
    placeOrder: 'button:has-text("Place Order"), button:has-text("Confirm Order")',
    addressSection: "form",
  },
};
