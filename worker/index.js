// Cloudflare Worker entry point (Workers + static assets).
// Static files are served directly from ./dist by Cloudflare; this Worker only
// receives /api/* requests (see "run_worker_first" in wrangler.jsonc) and reuses
// the same handlers as the Pages Functions in functions/api/.

import { onRequest as adminLogin } from '../functions/api/admin-login.js';
import { onRequest as getMartyrs } from '../functions/api/get-martyrs.js';

const routes = {
    '/api/admin-login': adminLogin,
    '/api/get-martyrs': getMartyrs
};

export default {
    async fetch(request, env) {
        const { pathname } = new URL(request.url);
        const handler = routes[pathname.replace(/\/+$/, '')];

        if (pathname.replace(/\/+$/, '') === '/api/get-martyrs' && request.method === 'GET') {
            try {
                const cache = caches.default;
                const cacheKey = new Request(request.url, request);
                let cachedResponse = await cache.match(cacheKey);
                if (cachedResponse) {
                    return cachedResponse;
                }
                const response = await getMartyrs({ request, env });
                if (response && response.ok) {
                    const responseToCache = new Response(response.clone().body, response);
                    responseToCache.headers.set('Cache-Control', 'public, max-age=1800, s-maxage=86400');
                    cache.put(cacheKey, responseToCache).catch(() => {});
                }
                return response;
            } catch (err) {
                return getMartyrs({ request, env });
            }
        }

        if (handler) {
            return handler({ request, env });
        }

        if (pathname.startsWith('/api/')) {
            return new Response(JSON.stringify({ error: 'Not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
            });
        }

        // Safety net for anything else that reaches the Worker
        return env.ASSETS.fetch(request);
    }
};
