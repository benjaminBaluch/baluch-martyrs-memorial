// Cloudflare Pages Function: POST /api/admin-login
// Port of netlify/functions/admin-login.js using the Web Crypto API
// (Cloudflare Workers has no Node 'crypto' / Buffer by default).
//
// Required environment variables (Pages > Settings > Variables and Secrets):
//   ADMIN_USERNAME       - admin username
//   ADMIN_PASSWORD_HASH  - SHA-256 hex digest of the admin password
//   JWT_SECRET           - long random string used to sign tokens

const encoder = new TextEncoder();

const JSON_HEADERS = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
};

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function toHex(buffer) {
    return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64url(input) {
    const bytes = typeof input === 'string' ? encoder.encode(input) : new Uint8Array(input);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(text) {
    return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

// Constant-time string comparison (avoids leaking how many characters matched)
function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

function fromBase64url(str) {
    const base64 = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

async function generateToken(payload, secret, hours = 4) {
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const now = Date.now();
    const body = base64url(JSON.stringify({ ...payload, exp: now + hours * 60 * 60 * 1000, iat: now }));

    const key = await crypto.subtle.importKey(
        'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`));
    return `${header}.${body}.${base64url(signature)}`;
}

export async function verifyToken(token, secret, expectedUsername = null) {
    try {
        if (!token || typeof token !== 'string' || !secret) return null;
        const parts = token.trim().split('.');
        if (parts.length !== 3) return null;

        const [header, body, signature] = parts;
        if (!header || !body || !signature) return null;

        const key = await crypto.subtle.importKey(
            'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const expectedSigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(`${header}.${body}`));
        const expectedSignature = base64url(expectedSigBuf);

        if (!safeEqual(signature, expectedSignature)) return null;

        const decoded = JSON.parse(fromBase64url(body));
        if (!decoded || typeof decoded.exp !== 'number' || decoded.exp <= Date.now()) {
            return null;
        }
        if (decoded.role !== 'admin') {
            return null;
        }
        if (expectedUsername && !safeEqual(String(decoded.username || ''), String(expectedUsername))) {
            return null;
        }
        return decoded;
    } catch {
        return null;
    }
}

function extractBearerToken(request) {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }
    const tokenHeader = request.headers.get('X-Admin-Token') || request.headers.get('x-admin-token') || '';
    return tokenHeader.trim();
}

export async function onRequest({ request, env }) {
    const adminUsername = env.ADMIN_USERNAME || 'admin';
    const adminPasswordHash = env.ADMIN_PASSWORD_HASH;
    const jwtSecret = env.JWT_SECRET;

    // GET /api/admin-login (or /api/admin-verify) -> Cryptographically verify existing admin JWT
    if (request.method === 'GET') {
        if (!jwtSecret) {
            return json({ success: false, valid: false, error: 'Server is not configured' }, 500);
        }
        const token = extractBearerToken(request);
        if (!token) {
            return json({ success: false, valid: false, error: 'Missing admin token' }, 401);
        }
        const decoded = await verifyToken(token, jwtSecret, adminUsername);
        if (!decoded) {
            return json({ success: false, valid: false, error: 'Invalid or expired admin token' }, 401);
        }

        const url = new URL(request.url);
        if (url.searchParams.get('extend') === '1') {
            const refreshedToken = await generateToken({ username: adminUsername, role: 'admin' }, jwtSecret, 4);
            const expiresIn = 4 * 60 * 60 * 1000;
            return json({
                success: true,
                valid: true,
                username: decoded.username,
                role: decoded.role,
                token: refreshedToken,
                expiresIn,
                exp: Date.now() + expiresIn
            });
        }

        return json({
            success: true,
            valid: true,
            username: decoded.username,
            role: decoded.role,
            exp: decoded.exp,
            expiresIn: Math.max(0, decoded.exp - Date.now())
        });
    }

    if (request.method !== 'POST') {
        return json({ error: 'Method not allowed' }, 405);
    }

    let credentials;
    try {
        credentials = await request.json();
    } catch {
        return json({ error: 'Invalid request body' }, 400);
    }

    const { username, password } = credentials || {};
    if (!username || !password) {
        return json({ error: 'Username and password required' }, 400);
    }

    // Fail closed: never fall back to a hard-coded signing secret
    if (!adminPasswordHash || !jwtSecret) {
        console.error('admin-login: ADMIN_PASSWORD_HASH and/or JWT_SECRET are not configured');
        return json({ error: 'Server is not configured' }, 500);
    }

    const providedHash = await sha256Hex(String(password));
    const usernameOk = safeEqual(String(username), adminUsername);
    const passwordOk = safeEqual(providedHash, adminPasswordHash.trim().toLowerCase());

    if (!usernameOk || !passwordOk) {
        console.log('admin-login: failed attempt');
        return json({ error: 'Invalid credentials' }, 401);
    }

    const token = await generateToken({ username: adminUsername, role: 'admin' }, jwtSecret, 4);
    return json({
        success: true,
        token,
        expiresIn: 4 * 60 * 60 * 1000, // 4 hours in ms
        username: adminUsername
    });
}
