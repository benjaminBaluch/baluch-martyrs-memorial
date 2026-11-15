// Cloudflare Worker entry point (Workers + static assets).
// Static files are served directly from ./dist by Cloudflare; this Worker receives
// /api/* and /gallery* requests (see "run_worker_first" in wrangler.jsonc) so it can
// handle API routes and inject per-profile Open Graph metadata on /gallery?hero=<id>.

import { onRequest as adminLogin } from '../functions/api/admin-login.js';
import { onRequest as contactHandler } from '../functions/api/contact.js';
import { onRequest as getMartyrs } from '../functions/api/get-martyrs.js';
import { onRequest as verifyTurnstile } from '../functions/api/verify-turnstile.js';

const routes = {
    '/api/admin-login': adminLogin,
    '/api/admin-verify': adminLogin,
    '/api/contact': contactHandler,
    '/api/get-martyrs': getMartyrs,
    '/api/verify-turnstile': verifyTurnstile
};

const FIRESTORE_PROJECT_ID = 'baluch-martyrs-memorial';
const FIRESTORE_DEFAULT_API_KEY = 'AIzaSyBW2JKt68kGKE-CMvKQUUj33ToZ8M-kGII';
const FIRESTORE_TIMEOUT_MS = 2500;
const MAX_DESC_LEN = 200;

let seedIndexPromise = null;
let seedIndexOrigin = '';

/** Escape attribute/text values before injecting HTML meta tags. */
function escapeAttr(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function escapeText(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/** Normalize martyr identifier strings for resilient lookup. */
function normalizeKey(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function toSlugKey(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Format a date value (Firestore timestamp wrapper, ISO string, YYYY-MM-DD) for meta summaries. */
function formatMetaDate(raw) {
    if (!raw) return '';
    let d = null;
    if (typeof raw === 'object') {
        if (typeof raw.seconds === 'number') {
            d = new Date(raw.seconds * 1000);
        } else if (typeof raw._seconds === 'number') {
            d = new Date(raw._seconds * 1000);
        } else if (typeof raw.toDate === 'function') {
            d = raw.toDate();
        }
    } else if (typeof raw === 'string' || typeof raw === 'number') {
        const text = String(raw).trim();
        if (!text || ['unknown', 'n/a', 'none', '-'].includes(text.toLowerCase())) return '';
        if (/^\d{4}$/.test(text)) return text;
        const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
            d = new Date(Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3])));
        } else {
            const parsed = new Date(text);
            if (!Number.isNaN(parsed.getTime())) d = parsed;
        }
    }
    if (!d || Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC'
    });
}

/** Extract compact metadata record from a martyr object to minimize isolate memory. */
function toCompactRecord(item) {
    if (!item || !item.fullName) return null;
    const cleanBio = String(item.biography || '').replace(/\s+/g, ' ').trim();
    return {
        id: String(item.id || '').trim(),
        fullName: String(item.fullName || '').trim(),
        martyrdomDate: formatMetaDate(item.martyrdomDate),
        martyrdomPlace: String(item.martyrdomPlace || '').trim(),
        organization: String(item.organization || '').trim(),
        bioSnippet: cleanBio.length > 260 ? cleanBio.slice(0, 260) : cleanBio,
        hasPhoto: Boolean(item.hasPhoto),
        photo: typeof item.photo === 'string' ? item.photo.trim() : ''
    };
}

/** Load and index /assets/martyrs-seed.json once per Worker isolate for 0ms edge lookups. */
async function getSeedIndex(origin, env) {
    if (seedIndexPromise && seedIndexOrigin === origin) {
        return seedIndexPromise;
    }
    seedIndexOrigin = origin;
    seedIndexPromise = (async () => {
        const byId = new Map();
        const byLowerId = new Map();
        const bySlug = new Map();
        try {
            const seedReq = new Request(new URL('/assets/martyrs-seed.json', origin).toString());
            const res = await env.ASSETS.fetch(seedReq);
            if (!res.ok) return { byId, byLowerId, bySlug };
            const payload = await res.json();
            const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
            for (const raw of list) {
                const rec = toCompactRecord(raw);
                if (!rec) continue;
                if (rec.id) {
                    byId.set(rec.id, rec);
                    byLowerId.set(rec.id.toLowerCase(), rec);
                }
                const nameKey = normalizeKey(rec.fullName);
                if (nameKey && !bySlug.has(nameKey)) bySlug.set(nameKey, rec);
                const slugKey = toSlugKey(rec.fullName);
                if (slugKey && !bySlug.has(slugKey)) bySlug.set(slugKey, rec);
            }
        } catch {
            // Seed index failure falls through to Firestore lookup / static fallback
        }
        return { byId, byLowerId, bySlug };
    })();
    return seedIndexPromise;
}

/** Decode a single Firestore REST field value. */
function decodeFirestoreValue(val) {
    if (!val || typeof val !== 'object') return undefined;
    if ('stringValue' in val) return val.stringValue;
    if ('timestampValue' in val) return val.timestampValue;
    if ('booleanValue' in val) return val.booleanValue;
    if ('integerValue' in val) return Number(val.integerValue);
    if ('doubleValue' in val) return Number(val.doubleValue);
    return undefined;
}

/** Single-document Firestore REST fallback for newly approved martyrs not yet in seed JSON. */
async function fetchMartyrFromFirestore(heroId, env) {
    if (!heroId || heroId.includes('/')) return null;
    const projectId = env?.FIREBASE_PROJECT_ID || FIRESTORE_PROJECT_ID;
    const apiKey = env?.FIREBASE_API_KEY || env?.VITE_FIREBASE_API_KEY || FIRESTORE_DEFAULT_API_KEY;
    const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/martyrs/${encodeURIComponent(heroId)}?key=${encodeURIComponent(apiKey)}`;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), FIRESTORE_TIMEOUT_MS) : null;
    try {
        const res = await fetch(endpoint, {
            headers: { Accept: 'application/json' },
            signal: controller ? controller.signal : undefined
        });
        if (!res.ok) return null;
        const doc = await res.json();
        const fields = doc?.fields;
        if (!fields || decodeFirestoreValue(fields.status) !== 'approved') return null;
        return toCompactRecord({
            id: heroId,
            fullName: decodeFirestoreValue(fields.fullName),
            martyrdomDate: decodeFirestoreValue(fields.martyrdomDate),
            martyrdomPlace: decodeFirestoreValue(fields.martyrdomPlace),
            organization: decodeFirestoreValue(fields.organization),
            biography: decodeFirestoreValue(fields.biography),
            photo: decodeFirestoreValue(fields.photo)
        });
    } catch {
        return null;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/** Look up a martyr record by ID, lowercase ID, or name slug, with Firestore REST fallback. */
async function resolveMartyrForHeroParam(heroParam, origin, env) {
    const clean = String(heroParam || '').trim();
    if (!clean) return null;

    const idx = await getSeedIndex(origin, env);
    const byExact = idx.byId.get(clean);
    if (byExact) return byExact;

    const lower = clean.toLowerCase();
    const byLower = idx.byLowerId.get(lower);
    if (byLower) return byLower;

    const byName = idx.bySlug.get(normalizeKey(clean)) || idx.bySlug.get(toSlugKey(clean));
    if (byName) return byName;

    return fetchMartyrFromFirestore(clean, env);
}

/** Resolve a crawlable HTTPS image URL (crawlers reject data: URIs). */
async function resolveWorkerOgImage(record, origin, env) {
    if (record.photo) {
        if (record.photo.startsWith('https://') || record.photo.startsWith('http://')) {
            return record.photo;
        }
        if (record.photo.startsWith('/')) {
            return new URL(record.photo, origin).toString();
        }
    }
    if (record.id) {
        const photoPath = `/assets/photos/${encodeURIComponent(record.id)}.jpg`;
        if (record.hasPhoto) {
            return new URL(photoPath, origin).toString();
        }
        try {
            const headRes = await env.ASSETS.fetch(new Request(new URL(photoPath, origin).toString(), { method: 'HEAD' }));
            if (headRes.ok) {
                return new URL(photoPath, origin).toString();
            }
        } catch {
            // Fall through to site emblem
        }
    }
    return new URL('/baluch-flag-logo.png', origin).toString();
}

/** Build structured Open Graph / Twitter Card metadata for a martyr profile. */
function buildHeroOgMetadata(record, url, imageUrl) {
    const name = record.fullName || 'Baluch Martyr';
    const title = `${name} — Baluch Martyrs Memorial`;

    const summaryParts = [];
    if (record.martyrdomDate && !['unknown', 'n/a', 'none', '-'].includes(record.martyrdomDate.toLowerCase())) {
        summaryParts.push(`Martyred ${record.martyrdomDate}`);
    }
    if (record.martyrdomPlace && !['unknown', 'n/a', 'none', '-'].includes(record.martyrdomPlace.toLowerCase())) {
        summaryParts.push(`in ${record.martyrdomPlace}`);
    }
    let prefix = summaryParts.join(' ');
    if (record.organization) {
        prefix = prefix ? `${prefix} (${record.organization})` : record.organization;
    }

    let description = prefix;
    if (record.bioSnippet) {
        description = prefix ? `${prefix}. ${record.bioSnippet}` : record.bioSnippet;
    }
    if (!description) {
        description = `Remembering ${name} on the Baluch Martyrs Memorial Archive.`;
    }
    if (description.length > MAX_DESC_LEN) {
        description = `${description.slice(0, MAX_DESC_LEN - 1).trimEnd()}…`;
    }

    const canonicalUrl = `${url.origin}/gallery?hero=${encodeURIComponent(record.id || url.searchParams.get('hero') || '')}`;

    return {
        title,
        description,
        image: imageUrl,
        url: canonicalUrl,
        imageAlt: `Portrait of ${name}`
    };
}

/** Rewrite <title> and OG/Twitter meta tags in gallery.html using Cloudflare HTMLRewriter. */
function rewriteGalleryHtmlMeta(htmlResponse, meta) {
    if (typeof HTMLRewriter === 'undefined') {
        return htmlResponse;
    }

    const seen = new Set();
    const metaValuesByKey = {
        'name:description': meta.description,
        'property:og:title': meta.title,
        'property:og:description': meta.description,
        'property:og:image': meta.image,
        'property:og:image:alt': meta.imageAlt,
        'property:og:url': meta.url,
        'property:og:type': 'profile',
        'property:og:site_name': 'Baluch Martyrs Memorial',
        'name:twitter:card': 'summary_large_image',
        'name:twitter:title': meta.title,
        'name:twitter:description': meta.description,
        'name:twitter:image': meta.image
    };

    const rewriter = new HTMLRewriter()
        .on('title', {
            element(el) {
                seen.add('title');
                el.setInnerContent(meta.title);
            }
        })
        .on('meta', {
            element(el) {
                const nameAttr = (el.getAttribute('name') || '').toLowerCase();
                const propAttr = (el.getAttribute('property') || '').toLowerCase();
                const key = propAttr ? `property:${propAttr}` : (nameAttr ? `name:${nameAttr}` : '');
                if (key && Object.prototype.hasOwnProperty.call(metaValuesByKey, key)) {
                    seen.add(key);
                    el.setAttribute('content', metaValuesByKey[key]);
                }
            }
        })
        .on('head', {
            element(el) {
                el.onEndTag((end) => {
                    const extraTags = [];
                    for (const [key, value] of Object.entries(metaValuesByKey)) {
                        if (seen.has(key) || !value) continue;
                        const sepIdx = key.indexOf(':');
                        const attr = key.slice(0, sepIdx);
                        const attrName = key.slice(sepIdx + 1);
                        extraTags.push(`<meta ${attr}="${escapeAttr(attrName)}" content="${escapeAttr(value)}">`);
                    }
                    if (!seen.has('title')) {
                        // <title> is already present in gallery.html, guard just in case
                        extraTags.push(`<meta name="title" content="${escapeAttr(meta.title)}">`);
                    }
                    if (extraTags.length > 0) {
                        end.before(`\n    ${extraTags.join('\n    ')}\n`, { html: true });
                    }
                });
            }
        });

    const rewritten = rewriter.transform(htmlResponse);
    const headers = new Headers(rewritten.headers);
    headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    return new Response(rewritten.body, {
        status: rewritten.status,
        statusText: rewritten.statusText,
        headers
    });
}

/** Fetch base gallery HTML asset cleanly even when auto-trailing-slash emits a redirect. */
async function fetchGalleryHtmlAsset(request, url, env) {
    let res = await env.ASSETS.fetch(request);
    if (res.status >= 300 && res.status < 400) {
        const canonicalGalleryReq = new Request(new URL('/gallery', url.origin).toString(), {
            method: request.method,
            headers: request.headers
        });
        res = await env.ASSETS.fetch(canonicalGalleryReq);
        if (res.status >= 300 && res.status < 400) {
            const directHtmlReq = new Request(new URL('/gallery.html', url.origin).toString(), {
                method: request.method,
                headers: request.headers
            });
            res = await env.ASSETS.fetch(directHtmlReq);
        }
    }
    return res;
}

/** Handle /gallery?hero=<id> requests by injecting dynamic martyr Open Graph metadata. */
async function handleGalleryHeroMeta(request, url, env) {
    const heroParam = (url.searchParams.get('hero') || url.searchParams.get('id') || '').trim();
    if (!heroParam || (request.method !== 'GET' && request.method !== 'HEAD')) {
        return env.ASSETS.fetch(request);
    }

    try {
        const [assetResponse, record] = await Promise.all([
            fetchGalleryHtmlAsset(request, url, env),
            resolveMartyrForHeroParam(heroParam, url.origin, env)
        ]);

        const contentType = assetResponse.headers.get('content-type') || '';
        if (!assetResponse.ok || !contentType.includes('text/html') || !record) {
            return assetResponse;
        }

        const imageUrl = await resolveWorkerOgImage(record, url.origin, env);
        const meta = buildHeroOgMetadata(record, url, imageUrl);
        return rewriteGalleryHtmlMeta(assetResponse, meta);
    } catch {
        return env.ASSETS.fetch(request);
    }
}

export {
    buildHeroOgMetadata,
    escapeAttr,
    escapeText,
    formatMetaDate,
    handleGalleryHeroMeta,
    resolveMartyrForHeroParam,
    resolveWorkerOgImage,
    rewriteGalleryHtmlMeta,
    toCompactRecord
};

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';
        const handler = routes[normalizedPath];

        if (handler) {
            return handler({ request, env });
        }

        if (normalizedPath.startsWith('/api/')) {
            return new Response(JSON.stringify({ error: 'Not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
            });
        }

        if (normalizedPath === '/gallery' || normalizedPath === '/gallery.html') {
            return handleGalleryHeroMeta(request, url, env);
        }

        // Safety net for anything else that reaches the Worker
        return env.ASSETS.fetch(request);
    }
};
