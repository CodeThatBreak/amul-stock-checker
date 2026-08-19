# Amul Stock Checker

Polls the Amul shop API for a product's stock status and sends a push
notification to your iPhone (via [ntfy.sh](https://ntfy.sh)) when it's in stock.
Runs on a schedule using GitHub Actions — free, no server to maintain.

## How it works

1. Playwright loads the product page in a headless browser so Cloudflare's
   JS challenge clears and cookies get set.
2. It reuses that authenticated browser context to call the product API
   directly (no manual cookie copy/paste, no expiry issues).
3. If the product is in stock, it POSTs a message to your ntfy.sh topic.
4. A GitHub Actions workflow runs this on a schedule (default: every 15 min).

## Setup

### 1. Get the iPhone notification working first

- Install the [ntfy app](https://apps.apple.com/app/ntfy/id1625396347) from the App Store.
- Open it, tap "+", and subscribe to a topic name of your choosing —
  make it hard to guess, e.g. `amul-whey-a8f3k2`, since anyone who knows
  the topic name can send you notifications or read them.

### 2. Push this repo to GitHub

```bash
cd amul-stock-checker
git init
git add .
git commit -m "Initial commit"
gh repo create amul-stock-checker --private --source=. --push
# or create the repo manually on GitHub and add it as a remote
```

### 3. Add your ntfy topic as a repo secret

In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**
- Name: `NTFY_TOPIC`
- Value: the topic name you picked above (e.g. `amul-whey-a8f3k2`)

### 4. Enable the workflow

The workflow file is already at `.github/workflows/check-stock.yml` and
will start running automatically on the schedule once pushed. You can also
trigger it manually from the **Actions** tab → "Check Amul Stock" → "Run workflow".

## Before relying on this

Run it once locally and inspect the real API response — the stock field
name (`product.available`) in `check-stock.js` is a guess based on common
e-commerce API shapes and needs to be verified against Amul's actual response:

```bash
npm install
npx playwright install chromium
NTFY_TOPIC=your-topic node check-stock.js
```

Add a `console.log(JSON.stringify(product, null, 2))` before the `inStock`
line temporarily to see the real field names, then update the script.

## Notes / limits

- GitHub Actions free tier gives 2,000 min/month for private repos
  (unlimited for public repos). This job takes ~30-60s per run; at
  15-min intervals that's well within the free tier.
- GitHub's cron scheduler isn't precise — expect a few minutes of jitter,
  and it can be delayed further during high load on GitHub's infra.
- Don't set the interval too aggressive (e.g. every 1-2 min) — repeated
  hits from GitHub's IP ranges are more likely to get flagged by
  Cloudflare than requests from a residential IP.
- If Amul changes their Cloudflare protection level, the headless browser
  approach may stop clearing the challenge — you'd see errors in the
  Actions logs if that happens.
