const puppeteer = require("puppeteer");

// ---- CONFIG ----
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
  const input = await page.$("#search");
  if (!input) {
    if (DEBUG)
      console.log(
        "Pincode input not shown — likely already set for this session.",
      );
    return;
  }

  const box = await input.boundingBox();
  if (!box) {
    if (DEBUG) console.log("Pincode input present but not visible.");
    return;
  }

  const currentValue = await page
    .$eval("#search", (el) => el.value)
    .catch(() => "");
  if (currentValue.trim() === pincode) {
    if (DEBUG) console.log("Pincode already set to", pincode);
    return;
  }

  await input.click({ clickCount: 3 });
  await page.keyboard.press("Backspace");
  await input.type(pincode, { delay: 50 });

  // Wait for the suggestion containing the pincode to appear
  await page.waitForFunction(
    (pc) => {
      const els = Array.from(
        document.querySelectorAll("a.searchitem-name p.item-name"),
      );
      return els.some((el) => el.textContent.includes(pc));
    },
    { timeout: 10000 },
    pincode,
  );

  // Click the matching suggestion
  await page.evaluate((pc) => {
    const els = Array.from(
      document.querySelectorAll("a.searchitem-name p.item-name"),
    );
    const match = els.find((el) => el.textContent.includes(pc));
    if (match) {
      (match.closest("a.searchitem-name") || match).click();
    }
  }, pincode);

  await page.waitForNetworkIdle({ timeout: 20000 }).catch(() => {});
}

async function checkProduct(browser, product) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    );

    await page.goto(product.url, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    await setPincode(page, PINCODE);

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
      await notify(`${product.name} is IN STOCK`, product.url);
    }

    return inStock;
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // avoids /dev/shm running out of space on small runners
    ],
  });

  const results = [];
  let hadError = false;

  for (const product of PRODUCTS) {
    try {
      const inStock = await checkProduct(browser, product);
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

main();
