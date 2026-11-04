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

export async function onRequest({ request, env }) {
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

    const adminUsername = env.ADMIN_USERNAME || 'admin';
    const adminPasswordHash = env.ADMIN_PASSWORD_HASH;
    const jwtSecret = env.JWT_SECRET;

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
