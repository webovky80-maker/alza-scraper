import { Actor } from 'apify';
import { CheerioCrawler, PlaywrightCrawler, log } from 'crawlee';
import * as cheerio from 'cheerio';

import {
    PRODUCT_URL_RE,
    extractListing,
    extractProduct,
    extractDomReviews,
    isBlocked,
    productIdFromUrl,
    toAbs,
} from './extract.js';

await Actor.init();

const input = (await Actor.getInput()) ?? {};
const {
    keywords = [],
    startUrls = [],
    domain = 'www.alza.sk',
    maxItems = 50,
    maxPagesPerList = 1,
    scrapeProductDetail = true,
    scrapeReviews = false,
    maxReviewsPerProduct = 20,
    useBrowser = false,
    maxConcurrency = 5,
    proxyConfiguration: proxyInput = { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
} = input;

const proxyConfiguration = await Actor.createProxyConfiguration(proxyInput);
if (!proxyConfiguration) {
    log.warning('No proxy configured. Alza blocks datacenter IPs — expect 403. Use RESIDENTIAL proxy.');
}

const limit = Number(maxItems) > 0 ? Number(maxItems) : Infinity;
let saved = 0;
let blockedCount = 0;
const seenProducts = new Set();

/* ---------------------------------------------------------------- requests */

const searchUrl = (kw, page = 1) => {
    const u = new URL(`https://${domain}/search.htm`);
    u.searchParams.set('exps', kw);
    if (page > 1) u.searchParams.set('pg', String(page));
    return u.toString();
};

const initialRequests = [];

for (const kw of keywords.filter(Boolean)) {
    initialRequests.push({
        url: searchUrl(kw, 1),
        userData: { label: 'LIST', page: 1, keyword: kw },
    });
}

for (const entry of startUrls) {
    const url = typeof entry === 'string' ? entry : entry?.url;
    if (!url) continue;
    initialRequests.push({
        url,
        userData: PRODUCT_URL_RE.test(url)
            ? { label: 'PRODUCT' }
            : { label: 'LIST', page: 1 },
    });
}

if (!initialRequests.length) {
    log.warning('No keywords and no startUrls provided — nothing to do.');
}

/* ------------------------------------------------------------------ output */

const pushProduct = async (item) => {
    if (saved >= limit) return;
    saved += 1;
    await Actor.pushData(item);
    if (saved >= limit) log.info(`Reached maxItems (${limit}), finishing.`);
};

/** Best-effort extra review pages via Alza's internal comment endpoint. */
const fetchMoreReviews = async ({ productUrl, productId, collected, sendRequest }) => {
    if (!productId || collected.length >= maxReviewsPerProduct) return collected;
    const origin = new URL(productUrl).origin;
    const endpoints = [
        `${origin}/Services/EShopService.svc/CommentsPageList`,
        `${origin}/Services/EShopService.svc/CommentList`,
    ];
    for (const endpoint of endpoints) {
        for (let page = 2; collected.length < maxReviewsPerProduct && page <= 20; page++) {
            let html = null;
            try {
                const res = await sendRequest({
                    url: endpoint,
                    method: 'POST',
                    headers: { 'content-type': 'application/json', accept: 'application/json', 'x-requested-with': 'XMLHttpRequest' },
                    body: JSON.stringify({ idProduct: Number(productId), pageNumber: page, page, sort: 0 }),
                    responseType: 'text',
                    throwHttpErrors: false,
                });
                if (!res?.body || String(res.statusCode)[0] !== '2') break;
                const json = JSON.parse(res.body);
                html = json?.d?.data ?? json?.d ?? json?.data ?? null;
                if (typeof html !== 'string' || !html.trim()) break;
            } catch {
                break;
            }
            const more = extractDomReviews(cheerio.load(html));
            if (!more.length) break;
            collected.push(...more);
        }
        if (collected.length > 0) break;
    }
    return collected.slice(0, maxReviewsPerProduct);
};

/* --------------------------------------------------------------- handlers */

const handleList = async ({ request, $, crawler, body }) => {
    if (isBlocked($, String(body ?? ''))) {
        blockedCount += 1;
        throw new Error('Blocked by Alza anti-bot — retrying with another proxy IP.');
    }
    const { items, nextUrl } = extractListing($, request.loadedUrl || request.url);
    log.info(`Listing ${request.url} → ${items.length} products`);

    for (const item of items) {
        if (saved >= limit || seenProducts.size >= limit) break;
        if (seenProducts.has(item.url)) continue;
        seenProducts.add(item.url);

        if (!scrapeProductDetail) {
            await pushProduct({
                type: 'product',
                ...item,
                keyword: request.userData.keyword ?? null,
                listingUrl: request.url,
                scrapedAt: new Date().toISOString(),
            });
        } else {
            await crawler.addRequests([{
                url: item.url,
                userData: { label: 'PRODUCT', keyword: request.userData.keyword ?? null, listing: item },
            }]);
        }
    }

    const page = request.userData.page ?? 1;
    if (page < maxPagesPerList && seenProducts.size < limit && saved < limit) {
        const next = nextUrl
            || (request.userData.keyword ? searchUrl(request.userData.keyword, page + 1) : null)
            || (() => {
                const u = new URL(request.url);
                u.searchParams.set('pg', String(page + 1));
                return u.toString();
            })();
        if (next) {
            await crawler.addRequests([{
                url: next,
                uniqueKey: `${next}#p${page + 1}`,
                userData: { ...request.userData, label: 'LIST', page: page + 1 },
            }]);
        }
    }
};

const handleProduct = async ({ request, $, body, sendRequest }) => {
    if (saved >= limit) return;
    if (isBlocked($, String(body ?? ''))) {
        blockedCount += 1;
        throw new Error('Blocked by Alza anti-bot — retrying with another proxy IP.');
    }
    const url = request.loadedUrl || request.url;
    const product = extractProduct($, url);

    let reviews = [];
    if (scrapeReviews) {
        const map = new Map();
        for (const r of [...product.reviews, ...extractDomReviews($)]) {
            const key = `${r.author}|${(r.text || '').slice(0, 80)}`;
            if (!map.has(key)) map.set(key, r);
        }
        reviews = [...map.values()].slice(0, maxReviewsPerProduct);
        if (reviews.length < maxReviewsPerProduct && sendRequest) {
            reviews = await fetchMoreReviews({
                productUrl: url,
                productId: product.productId ?? productIdFromUrl(url),
                collected: reviews,
                sendRequest,
            });
        }
    }

    await pushProduct({
        ...product,
        keyword: request.userData.keyword ?? null,
        image: product.images?.[0] ?? request.userData.listing?.image ?? null,
        reviews,
        reviewsScraped: reviews.length,
    });
};

const router = async (ctx) => {
    if (saved >= limit) return;
    if (ctx.request.userData.label === 'PRODUCT') return handleProduct(ctx);
    return handleList(ctx);
};

/* ---------------------------------------------------------------- crawlers */

const shared = {
    proxyConfiguration,
    maxConcurrency,
    maxRequestRetries: 5,
    requestHandlerTimeoutSecs: 90,
    failedRequestHandler: async ({ request }, error) => {
        log.warning(`Giving up on ${request.url}: ${error?.message}`);
        await Actor.pushData({
            type: 'error',
            url: request.url,
            error: error?.message ?? 'unknown',
            scrapedAt: new Date().toISOString(),
        });
    },
};

const crawler = useBrowser
    ? new PlaywrightCrawler({
        ...shared,
        launchContext: { launchOptions: { args: ['--disable-gpu', '--blink-settings=imagesEnabled=false'] } },
        preNavigationHooks: [async ({ page }) => {
            // Block heavy assets — big cost saver in browser mode.
            await page.route('**/*', (route) => {
                const t = route.request().resourceType();
                return ['image', 'media', 'font', 'stylesheet'].includes(t) ? route.abort() : route.continue();
            });
        }],
        requestHandler: async (ctx) => {
            const html = await ctx.page.content();
            const $ = cheerio.load(html);
            await router({ ...ctx, $, body: html, sendRequest: ctx.sendRequest });
        },
    })
    : new CheerioCrawler({
        ...shared,
        additionalMimeTypes: ['application/json'],
        preNavigationHooks: [async ({ request }) => {
            request.headers = {
                ...request.headers,
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'accept-language': domain.endsWith('.sk') ? 'sk-SK,sk;q=0.9,en;q=0.7' : 'cs-CZ,cs;q=0.9,en;q=0.7',
                'upgrade-insecure-requests': '1',
            };
        }],
        requestHandler: router,
    });

await crawler.run(initialRequests);

log.info(`Done. Saved ${saved} items. Blocked responses encountered: ${blockedCount}.`);
if (saved === 0 && blockedCount > 0) {
    log.error('Everything was blocked. Enable RESIDENTIAL proxy with the right country, or turn on "Use headless browser".');
}

await Actor.exit();
