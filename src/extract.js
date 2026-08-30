/**
 * Pure extraction helpers (cheerio $ in, plain objects out).
 * Every selector has fallbacks because Alza A/B-tests its markup.
 */

export const PRODUCT_URL_RE = /-d\d+\.htm/i;

export const toAbs = (href, base) => {
    if (!href) return null;
    try {
        return new URL(href, base).toString().split('#')[0];
    } catch {
        return null;
    }
};

export const productIdFromUrl = (url) => {
    const m = String(url || '').match(/-d(\d+)\.htm/i);
    return m ? m[1] : null;
};

export const parsePrice = (text) => {
    if (text === null || text === undefined) return null;
    const raw = String(text).replace(/\u00a0/g, ' ');
    // keep digits, spaces, dots and commas; drop currency and words
    const m = raw.match(/-?\d[\d\s.,]*/);
    if (!m) return null;
    let n = m[0].replace(/\s/g, '');
    if (n.includes(',') && n.includes('.')) {
        n = n.lastIndexOf(',') > n.lastIndexOf('.')
            ? n.replace(/\./g, '').replace(',', '.')
            : n.replace(/,/g, '');
    } else if (n.includes(',')) {
        n = /,\d{1,2}$/.test(n) ? n.replace(',', '.') : n.replace(/,/g, '');
    } else if (/\.\d{3}(\D|$)/.test(n)) {
        n = n.replace(/\./g, '');
    }
    const v = Number.parseFloat(n);
    return Number.isFinite(v) ? v : null;
};

export const detectCurrency = (text = '', url = '') => {
    const t = String(text);
    if (/€|EUR/i.test(t)) return 'EUR';
    if (/Kč|CZK/i.test(t)) return 'CZK';
    if (/Ft|HUF/i.test(t)) return 'HUF';
    if (/£|GBP/i.test(t)) return 'GBP';
    if (/USD|\$/.test(t)) return 'USD';
    if (/alza\.sk|alza\.de|alza\.at/.test(url)) return 'EUR';
    if (/alza\.cz/.test(url)) return 'CZK';
    if (/alza\.hu/.test(url)) return 'HUF';
    if (/alza\.co\.uk/.test(url)) return 'GBP';
    return null;
};

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s) || null;

const firstText = ($, selectors) => {
    for (const sel of selectors) {
        const el = $(sel).first();
        if (el.length) {
            const t = clean(el.text());
            if (t) return t;
        }
    }
    return null;
};

/** Collect and flatten every JSON-LD node on the page. */
export const jsonLdNodes = ($) => {
    const out = [];
    $('script[type="application/ld+json"]').each((_, el) => {
        const raw = $(el).contents().text() || $(el).html();
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw.trim());
            const stack = Array.isArray(parsed) ? [...parsed] : [parsed];
            while (stack.length) {
                const node = stack.pop();
                if (!node || typeof node !== 'object') continue;
                out.push(node);
                if (Array.isArray(node['@graph'])) stack.push(...node['@graph']);
            }
        } catch {
            /* malformed JSON-LD is common, ignore */
        }
    });
    return out;
};

const typeIs = (node, type) => {
    const t = node?.['@type'];
    return Array.isArray(t) ? t.includes(type) : t === type;
};

const normalizeReview = (r) => {
    if (!r || typeof r !== 'object') return null;
    const body = clean(r.reviewBody || r.description);
    const rating = r.reviewRating?.ratingValue ?? r.ratingValue ?? null;
    if (!body && rating === null) return null;
    return {
        author: clean(typeof r.author === 'string' ? r.author : r.author?.name),
        rating: rating === null ? null : Number.parseFloat(String(rating).replace(',', '.')),
        title: clean(r.name),
        text: body,
        date: r.datePublished || null,
        pros: [],
        cons: [],
        source: 'json-ld',
    };
};

/** Reviews rendered in the product page HTML. */
export const extractDomReviews = ($) => {
    const reviews = [];
    const blocks = $('[itemprop="review"], .reviewBox, .review-item, .commentBox, [data-testid="review"]');
    blocks.each((_, el) => {
        const $el = $(el);
        const text = clean(
            $el.find('[itemprop="reviewBody"], .reviewText, .comment-text, p').first().text() || '',
        );
        const ratingAttr = $el.find('[itemprop="ratingValue"]').first().attr('content')
            || clean($el.find('[itemprop="ratingValue"]').first().text());
        let rating = ratingAttr ? parsePrice(ratingAttr) : null;
        if (rating === null) {
            const style = $el.find('.starsSmall span, .rating .stars span, .starsBox span').first().attr('style');
            const pct = style && style.match(/width:\s*([\d.]+)%/);
            if (pct) rating = Math.round((Number.parseFloat(pct[1]) / 20) * 10) / 10;
        }
        const pros = [];
        const cons = [];
        $el.find('.plus li, .pros li, [class*="positive"] li').each((__, li) => {
            const t = clean($(li).text());
            if (t) pros.push(t);
        });
        $el.find('.minus li, .cons li, [class*="negative"] li').each((__, li) => {
            const t = clean($(li).text());
            if (t) cons.push(t);
        });
        if (!text && rating === null && !pros.length && !cons.length) return;
        reviews.push({
            author: clean($el.find('[itemprop="author"], .author, .userName').first().text()),
            rating,
            title: clean($el.find('.reviewTitle, [itemprop="name"], h3, h4').first().text()),
            text,
            date: clean($el.find('[itemprop="datePublished"], .date, time').first().text()),
            pros,
            cons,
            source: 'html',
        });
    });
    return reviews;
};

/** Technical parameters table on the product / specs tab. */
const extractSpecs = ($) => {
    const specs = {};
    $('#paramsTable tr, .params tr, table.parameters tr, .specification tr').each((_, tr) => {
        const cells = $(tr).find('th, td');
        if (cells.length < 2) return;
        const key = clean($(cells[0]).text());
        const value = clean($(cells[1]).text());
        if (key && value) specs[key.replace(/:$/, '')] = value;
    });
    $('.param-row, .parameter').each((_, row) => {
        const key = clean($(row).find('.param-name, .name').first().text());
        const value = clean($(row).find('.param-value, .value').first().text());
        if (key && value) specs[key.replace(/:$/, '')] = value;
    });
    return specs;
};

/** Parse a product detail page. */
export const extractProduct = ($, url) => {
    const ld = jsonLdNodes($);
    const product = ld.find((n) => typeIs(n, 'Product')) || {};
    const offerRaw = Array.isArray(product.offers) ? product.offers[0] : product.offers;
    const offer = offerRaw || {};
    const agg = product.aggregateRating || {};
    const breadcrumbNode = ld.find((n) => typeIs(n, 'BreadcrumbList'));

    const priceText = firstText($, [
        '.price-box__price', '.priceDetail .price_withVat', '#prices .price_withVat',
        '.price_withVat', '.c2 .price', '[data-testid="price"]',
    ]);
    const price = offer.price !== undefined ? parsePrice(offer.price) : parsePrice(priceText);
    const currency = offer.priceCurrency || detectCurrency(priceText || '', url);

    const listPriceText = firstText($, ['.price-box__compare-price', '.priceCompare .price', '.crossedOut', '.priceWithoutVat + .price']);
    const listPrice = parsePrice(listPriceText);

    const availability = clean(
        firstText($, ['#availability-value', '.avlVal', '.stock-avail', '[data-testid="availability"]', '.availability'])
        || (typeof offer.availability === 'string' ? offer.availability.split('/').pop() : null),
    );

    const images = [];
    const pushImg = (src) => {
        const abs = toAbs(src, url);
        if (abs && !images.includes(abs)) images.push(abs);
    };
    if (product.image) (Array.isArray(product.image) ? product.image : [product.image]).forEach(pushImg);
    $('#gallery img, .gallery img, #detailPicture img, meta[property="og:image"]').each((_, el) => {
        pushImg($(el).attr('content') || $(el).attr('data-src') || $(el).attr('src'));
    });

    const breadcrumbs = breadcrumbNode?.itemListElement?.map((i) => clean(i?.item?.name || i?.name)).filter(Boolean)
        || $('.breadcrumbs a, nav[aria-label="breadcrumb"] a').map((_, a) => clean($(a).text())).get().filter(Boolean);

    const ldReviews = []
        .concat(product.review || [], ld.filter((n) => typeIs(n, 'Review')))
        .map(normalizeReview)
        .filter(Boolean);

    return {
        type: 'product',
        url,
        productId: productIdFromUrl(url),
        code: clean(product.sku || product.mpn || firstText($, ['#orderCode', '.orderCode', '[data-testid="product-code"]'])),
        ean: clean(product.gtin13 || product.gtin || product.gtin8 || null),
        name: clean(product.name || firstText($, ['h1[itemprop="name"]', 'h1.name', 'h1'])),
        brand: clean(typeof product.brand === 'string' ? product.brand : product.brand?.name)
            || clean(firstText($, ['.producerLogo img', '.brand a'])),
        price,
        listPrice: listPrice && price && listPrice > price ? listPrice : null,
        currency,
        discountPercent: listPrice && price && listPrice > price
            ? Math.round(((listPrice - price) / listPrice) * 100)
            : null,
        inStock: /InStock|skladom|skladem|raktáron|auf Lager|in stock/i.test(
            `${offer.availability || ''} ${availability || ''}`,
        ),
        availability,
        rating: agg.ratingValue !== undefined ? parsePrice(agg.ratingValue) : parsePrice(firstText($, ['.ratingValue', '[itemprop="ratingValue"]'])),
        ratingCount: agg.reviewCount ?? agg.ratingCount ?? parsePrice(firstText($, ['[itemprop="reviewCount"]', '.ratingCount'])),
        shortDescription: clean(product.description || firstText($, ['.nameextc', '.shortDescription', '[data-testid="short-description"]'])),
        description: clean($('#popis, .productDescription, #detailText').first().text())?.slice(0, 8000) || null,
        specs: extractSpecs($),
        breadcrumbs,
        category: breadcrumbs?.length ? breadcrumbs[breadcrumbs.length - 1] : null,
        images: images.slice(0, 20),
        reviews: ldReviews,
        scrapedAt: new Date().toISOString(),
    };
};

/** Parse a search / category listing page into product stubs + next page URL. */
export const extractListing = ($, url) => {
    const items = [];
    const seen = new Set();

    $('.browsingitem, .box.browsingitem, [data-testid="product-box"], .productBox').each((_, el) => {
        const $el = $(el);
        const href = toAbs($el.find('a.name, a.browsinglink, a[href*="-d"]').first().attr('href'), url);
        if (!href || !PRODUCT_URL_RE.test(href) || seen.has(href)) return;
        seen.add(href);
        const priceText = clean($el.find('.price, .c2 .price, .priceDetail').first().text());
        items.push({
            url: href,
            productId: productIdFromUrl(href),
            name: clean($el.find('a.name, .name a, h2, h3').first().text()),
            listPriceText: priceText,
            price: parsePrice(priceText),
            currency: detectCurrency(priceText || '', url),
            image: toAbs($el.find('img').first().attr('data-src') || $el.find('img').first().attr('src'), url),
            availability: clean($el.find('.avail, .avlVal, .stock').first().text()),
        });
    });

    // Fallback: any product-looking link on the page.
    if (!items.length) {
        $('a[href*="-d"]').each((_, a) => {
            const href = toAbs($(a).attr('href'), url);
            if (!href || !PRODUCT_URL_RE.test(href) || seen.has(href)) return;
            seen.add(href);
            items.push({ url: href, productId: productIdFromUrl(href), name: clean($(a).text()) });
        });
    }

    const nextHref = $('a.next, .pagination a[rel="next"], link[rel="next"], .paginator a.next').first().attr('href');
    return { items, nextUrl: toAbs(nextHref, url) };
};

export const isBlocked = ($, body = '') => {
    const title = ($('title').first().text() || '').toLowerCase();
    return title.includes('alza.cz') && /bezpe(č|c)nostn|z masa a kost|blocked|captcha/i.test(body)
        || /Prosím, potvrďte, že jste z masa a kostí/i.test(body);
};
