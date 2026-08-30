# 🛒 Alza Scraper – Products, Prices, Stock & Reviews (CZ, SK, HU, DE, AT, UK)

Extract structured data from [Alza.cz](https://www.alza.cz), [Alza.sk](https://www.alza.sk), and Alza's other European stores — one of Central Europe's largest electronics retailers. Get **product details, prices, stock availability, specifications, and customer reviews** for any keyword or product page, no coding required.

---

## 📑 Table of Contents

- [Why use this Actor](#-why-use-alza-scraper)
- [What you can scrape](#️-what-can-you-scrape)
- [Input parameters](#-input-parameters)
- [Usage examples](#-usage-examples)
- [Output data](#-output-data)
- [How to run](#-how-to-run)
- [FAQ](#-faq)
- [Privacy & legal](#️-privacy--legal)

---

## ✨ Why Use Alza Scraper?

- 🌍 **6 Alza stores, one Actor** — switch between Alza.cz, Alza.sk, Alza.hu, Alza.de, Alza.at, and Alza.co.uk with a single input field.
- 🔎 **Search by keyword or URL** — give it plain keywords and it builds the search for you, or paste direct product, category, or search URLs.
- 💰 **Full price picture** — current price, original price, discount percentage, and currency, auto-detected per store.
- 📦 **Stock & specs** — availability status, full specification table, brand, EAN/SKU, and images.
- ⭐ **Customer reviews** — ratings, review text, and pros/cons, pulled from the page and Alza's own review API for deeper pagination.
- 🛡️ **Built to handle blocking** — automatically detects Alza's anti-bot challenge page and retries with a fresh proxy IP instead of silently failing.
- 🧭 **Optional browser fallback** — plain HTTP is the default (cheapest), but a headless-browser mode can be switched on if a run reports blocked pages.

---

## 🗂️ What Can You Scrape?

| Data type | Includes |
|---|---|
| 💼 **Products** | Name, brand, EAN/SKU, price, list price, discount %, currency, stock status, images |
| 📋 **Specifications** | Full technical parameter table as listed on the product page |
| ⭐ **Reviews** | Author, rating, title, text, date, pros/cons |
| 🔎 **Listings** | Products found on a search or category page, with name, price, and availability |

---

## 📥 Input Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `keywords` | Array | `[]` | Search terms, e.g. `["iphone 16"]` — a search is run on the selected domain for each |
| `startUrls` | Array | `[]` | Direct Alza URLs — product pages (`…-dXXXXXX.htm`), categories, or search results |
| `domain` | Select | `www.alza.sk` | Which Alza store to search: `.cz`, `.sk`, `.hu`, `.de`, `.at`, `.co.uk` |
| `maxItems` | Integer | `50` | Hard cap on scraped products — your main credit-protection setting 🛡️ (`0` = unlimited) |
| `maxPagesPerList` | Integer | `1` | Max listing pages followed per keyword/URL |
| `scrapeProductDetail` | Boolean | `true` | Off = only listing data (name, price, url, image) — the cheapest mode. On = full product page detail |
| `scrapeReviews` | Boolean | `false` | Fetch customer reviews for each product |
| `maxReviewsPerProduct` | Integer | `20` | Cap on reviews pulled per product |
| `useBrowser` | Boolean | `false` | Headless-browser fallback — leave off (HTTP is ~10x cheaper), turn on only if runs report blocked pages |
| `proxyConfiguration` | Object | Apify Proxy (Residential) | Alza blocks datacenter IPs — Residential proxy is used by default |
| `maxConcurrency` | Integer | `5` | Parallel requests — lower is gentler on the site |

> 💡 You need at least one `keyword` or `startUrl` to run the Actor.

---

## 📖 Usage Examples

### 1. 🔎 Search by keyword

```json
{
  "keywords": ["iphone 16"],
  "domain": "www.alza.sk",
  "maxItems": 20
}
```

### 2. 📦 Scrape one product with reviews

```json
{
  "startUrls": ["https://www.alza.sk/iphone-16-d1234567.htm"],
  "scrapeReviews": true,
  "maxReviewsPerProduct": 50
}
```

### 3. ⚡ Fast run — listing data only, no product pages

```json
{
  "keywords": ["mechanical keyboard"],
  "scrapeProductDetail": false,
  "maxItems": 100
}
```

### 4. 🇨🇿 Same search, Czech store

```json
{
  "keywords": ["iphone 16"],
  "domain": "www.alza.cz"
}
```

---

## 📤 Output Data

Results land in your Apify Dataset and can be exported as **JSON, CSV, Excel, XML, or HTML**.

Each product includes: `name`, `brand`, `code`/`ean`, `price`, `listPrice`, `discountPercent`, `currency`, `inStock`, `availability`, `rating`, `ratingCount`, `shortDescription`, `description`, `specs{}`, `breadcrumbs`, `category`, `images[]`, `reviews[]`, `url`, and `scrapedAt`.

> 📞 Full specs and reviews are only populated when `scrapeProductDetail` / `scrapeReviews` are turned on. Failed pages are logged separately with `type: "error"` so you can see what to retry.

---

## 🚀 How to Run

1. Open the Actor in the [Apify Console](https://console.apify.com).
2. Enter one or more `keywords`, or paste `startUrls`.
3. Click **Start** ▶️.
4. Download your results from the **Dataset** tab.

It also works from the Apify CLI, the REST API, the JS/Python client, or on a Schedule — for example, a recurring run to track price or stock changes on products you're monitoring.

---

## 🔧 Troubleshooting

| Problem | Likely fix |
|---|---|
| 📭 Empty dataset | Keyword too narrow, or try a direct `startUrls` link instead |
| 🚫 Blocked / CAPTCHA page detected | Keep Residential proxy enabled (it's the default) and lower `maxConcurrency` |
| 🐌 Still blocked with proxy on | Turn on `useBrowser` as a fallback |
| 💸 Run costs more than expected | Lower `maxItems`, disable `scrapeReviews`, or leave `useBrowser` off |

---

## ❓ FAQ

**Which Alza stores are supported?**
Alza.cz, Alza.sk, Alza.hu, Alza.de, Alza.at, and Alza.co.uk — pick one with the `domain` field.

**Do I need a proxy?**
Yes — Alza blocks plain datacenter requests, so Residential proxy is used by default. You don't need to configure anything extra.

**Can I track price or stock changes over time?**
Yes — run the Actor on a Schedule (e.g. daily) with the same `startUrls` or `keywords` and compare results between runs.

**Can I scrape just one product page?**
Yes — put its URL in `startUrls` and leave `keywords` empty.

**Is this legal?**
Only publicly available product and review data is collected. How you use the extracted data afterward is your responsibility.

---

## ⚖️ Privacy & Legal

- ✅ Only scrapes **publicly available** product and review data.
- ✅ Respects Alza's robots.txt and terms of service.
- ℹ️ This Actor is just an automation tool; how you use the extracted data is your own responsibility.

---

> **Keywords:** Alza scraper, Alza.cz scraper, Alza.sk scraper, e-commerce price monitoring, product price tracking Czech Republic, product price tracking Slovakia, electronics retailer scraper, Alza product data, Alza stock availability.

**Happy scraping! 🚀**
