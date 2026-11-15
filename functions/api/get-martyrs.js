// Cloudflare Worker / Pages Function: GET /api/get-martyrs
// Legacy array-format endpoint preserved for full backward compatibility.
// Delegates to the shared D1 / Edge-Cache / Firestore-delta store in _edge-store.js
// instead of looping pageSize=50 over Firestore (which breaks Cloudflare's 50-subrequest limit).

import {
    ensureD1Seeded,
    fetchAllFirestorePublicMartyrs,
    rowToMartyr
} from './_edge-store.js';

const HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*'
};

function sortKeyTimestamp(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const ms = Date.parse(val);
        return Number.isNaN(ms) ? 0 : ms;
    }
    if (typeof val === 'object' && typeof val.seconds === 'number') {
        return val.seconds * 1000;
    }
    return 0;
}

export async function onRequest({ request, env }) {
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                ...HEADERS,
                'Cache-Control': 'no-store',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        });
    }
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...HEADERS, 'Cache-Control': 'no-store' }
        });
    }

    const url = new URL(request.url);
    try {
        let martyrs = [];

        if (env && env.ARCHIVE_DB) {
            await ensureD1Seeded(url.origin, env);
            const res = await env.ARCHIVE_DB
                .prepare("SELECT * FROM martyrs WHERE status = 'approved' ORDER BY approved_at_ms DESC, id ASC")
                .all();
            martyrs = (res?.results || []).map((r) => rowToMartyr(r, { lite: false })).filter(Boolean);
        } else {
            // Forward through /api/edge-archive handler via direct import to leverage Edge Cache + Seed + Delta
            const { onRequest: edgeArchiveOnRequest } = await import('./edge-archive.js');
            const edgeReq = new Request(new URL('/api/edge-archive?mode=full', url.origin).toString(), {
                method: 'GET',
                headers: { Accept: 'application/json' }
            });
            const edgeRes = await edgeArchiveOnRequest({ request: edgeReq, env });
            if (edgeRes.ok) {
                const payload = await edgeRes.json();
                if (Array.isArray(payload?.data)) {
                    martyrs = payload.data;
                }
            }
            if (martyrs.length === 0) {
                const live = await fetchAllFirestorePublicMartyrs(env);
                martyrs = live.filter((m) => !m.status || m.status === 'approved');
            }
            martyrs.sort((a, b) => sortKeyTimestamp(b.approvedAt) - sortKeyTimestamp(a.approvedAt));
        }

        return new Response(JSON.stringify(martyrs), { status: 200, headers: HEADERS });
    } catch (error) {
        console.error('get-martyrs failed:', error);
        return new Response(JSON.stringify({ error: 'Database error' }), {
            status: 502,
            headers: { ...HEADERS, 'Cache-Control': 'no-store' }
        });
    }
}
