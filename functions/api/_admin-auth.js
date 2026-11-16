// Shared Admin JWT Authentication & JSON Response Helpers for Cloudflare Functions

import { verifyToken } from './admin-login.js';

export const JSON_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
};

export function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export function extractAdminToken(request) {
    const auth = request.headers.get('Authorization') || request.headers.get('authorization') || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
    return (request.headers.get('X-Admin-Token') || request.headers.get('x-admin-token') || '').trim();
}

export async function authorizeAdmin(request, env, options = {}) {
    const secret = env?.JWT_SECRET;
    const expectedUsername = env?.ADMIN_USERNAME || 'admin';
    if (!secret) {
        return {
            ok: false,
            status: 500,
            error: options.missingSecretError || 'Server JWT_SECRET is not configured.'
        };
    }

    const token = extractAdminToken(request);
    if (!token) {
        return {
            ok: false,
            status: 401,
            error: options.missingTokenError || 'Missing admin authentication token.'
        };
    }

    const decoded = await verifyToken(token, secret, expectedUsername);
    if (!decoded) {
        return {
            ok: false,
            status: 401,
            error: options.invalidTokenError || 'Invalid or expired admin token.'
        };
    }

    return { ok: true, admin: decoded, token };
}
