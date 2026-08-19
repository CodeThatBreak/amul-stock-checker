const { chromium } = require("playwright");

// ---- CONFIG ----
// Add/remove products here — each just needs its product page URL.
const PRODUCTS = [
  {
    name: "Amul Whey Protein (Pack of 60 sachets)",
    url: "https://shop.amul.com/en/product/amul-whey-protein-32-g-or-pack-of-60-sachets",
  },
  {
    name: "Amul Whey Protein (Pack of 30 sachets)",
    url: "https://shop.amul.com/en/product/amul-whey-protein-32-g-or-pack-of-30-sachets",
  },
];

const PINCODE = process.env.PINCODE || "110027";

const NTFY_TOPIC = process.env.NTFY_TOPIC;
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;
const DEBUG = process.env.DEBUG === "1";

async function setPincode(page, pincode) {
  const input = page.locator("#search");

  const inputVisible = await input.isVisible().catch(() => false);
  if (!inputVisible) {
    if (DEBUG)
      console.log(
        "Pincode input not shown — likely already set for this session.",
      );
    return;
  }

  const currentValue = await input.inputValue().catch(() => "");
  if (currentValue.trim() === pincode) {
    if (DEBUG) console.log("Pincode already set to", pincode);
    return;
  }

  await input.click();
  await input.fill("");
  await input.type(pincode, { delay: 50 });

  const suggestion = page
    .locator("a.searchitem-name p.item-name", { hasText: pincode })
    .first();
  await suggestion.waitFor({ state: "visible", timeout: 10000 });
  await suggestion.click();

  await page
    .waitForLoadState("networkidle", { timeout: 20000 })
    .catch(() => {});
}

async function checkProduct(context, product) {
  const page = await context.newPage();
  try {
    await page.goto(product.url, { waitUntil: "networkidle", timeout: 30000 });

    await setPincode(page, PINCODE);

    // Wait for the button to actually be in the DOM before reading its state
    await page.waitForSelector("a.add-to-cart", { timeout: 15000 });

    const isDisabled = await page.evaluate(() => {
      const btn = document.querySelector("a.add-to-cart");
      if (!btn) return null;
      return btn.hasAttribute("disabled") || btn.classList.contains("disabled");
    });

    if (isDisabled === null) {
      throw new Error(
        "Add to Cart button not found on page — page structure may have changed",
      );
    }

    const inStock = !isDisabled;

    console.log(
      `[${new Date().toISOString()}] ${product.name}: ${inStock ? "IN STOCK" : "out of stock"}`,
    );

    if (inStock) {
      await notify(`${product.name} is OUT OF STOCK`, product.url);
    }

    return inStock;
  } finally {
    await page.close();
  }
}

async function notify(message, url) {
  if (!NTFY_TOPIC) {
    console.warn("NTFY_TOPIC not set — skipping notification");
    return;
  }
  await fetch(NTFY_URL, {
    method: "POST",
    headers: {
      Title: "Stock Alert",
      Click: url,
      Priority: "high",
      Tags: "bell",
    },
    body: message,
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  });

  const results = [];
  let hadError = false;

  // Sequential, not parallel — keeps load light and avoids tripping
  // Cloudflare rate limits from firing multiple page loads at once.
  for (const product of PRODUCTS) {
    try {
      const inStock = await checkProduct(context, product);
      results.push({ product: product.name, inStock });
    } catch (err) {
      hadError = true;
      console.error(`Error checking ${product.name}:`, err.message);
    }
  }

  await browser.close();

  if (DEBUG) {
    console.log("Summary:", results);
  }

  if (hadError) process.exit(1);
}

main();
