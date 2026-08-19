const { chromium } = require('playwright');

// ---- CONFIG ----
const PRODUCT_ALIAS = 'amul-whey-protein-32-g-or-pack-of-60-sachets';
const PRODUCT_URL = `https://shop.amul.com/en/product/${PRODUCT_ALIAS}`;
const API_URL = `https://shop.amul.com/api/1/entity/ms.products?q=${encodeURIComponent(
  JSON.stringify({ alias: PRODUCT_ALIAS })
)}&limit=1`;

const NTFY_TOPIC = process.env.NTFY_TOPIC; // set as a secret, don't hardcode
const NTFY_URL = `https://ntfy.sh/${NTFY_TOPIC}`;

async function checkStock() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    // Load the product page first so Cloudflare clears and cookies get set
    await page.goto(PRODUCT_URL, { waitUntil: 'networkidle', timeout: 30000 });

    // Reuse the same authenticated context to hit the API
    const response = await page.request.get(API_URL, {
      headers: {
        accept: 'application/json, text/plain, */*',
        base_url: PRODUCT_URL,
        frontend: '1',
        referer: PRODUCT_URL,
      },
    });

    if (!response.ok()) {
      throw new Error(`API responded with status ${response.status()}`);
    }

    const data = await response.json();
    const product = data?.data?.[0];

    if (!product) {
      throw new Error('Product not found in API response — alias may have changed');
    }

    // NOTE: verify this field name against a real response before relying on it.
    // Amul's product API typically exposes stock via `available` (0/1) or `inventory_quantity`.
    const inStock = product.available === 1;

    console.log(`[${new Date().toISOString()}] ${product.name || PRODUCT_ALIAS}: ${inStock ? 'IN STOCK' : 'out of stock'}`);

    if (inStock) {
      await notify(`${product.name || 'Amul Whey Protein'} is IN STOCK`, PRODUCT_URL);
    }

    return inStock;
  } finally {
    await browser.close();
  }
}

async function notify(message, url) {
  if (!NTFY_TOPIC) {
    console.warn('NTFY_TOPIC not set — skipping notification');
    return;
  }
  await fetch(NTFY_URL, {
    method: 'POST',
    headers: {
      Title: 'Stock Alert',
      Click: url,
      Priority: 'high',
      Tags: 'bell',
    },
    body: message,
  });
}

checkStock().catch((err) => {
  console.error('Check failed:', err.message);
  process.exit(1);
});
