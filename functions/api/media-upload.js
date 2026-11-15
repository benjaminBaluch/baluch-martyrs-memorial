// Cloudflare Worker / Pages Function: POST /api/media-upload
// Admin-only content-addressed media upload into sharded R2 buckets (MEDIA_S1, MEDIA_S2, ...).
// Deduplicates via SHA-256 content hash, enforces strict image validation & size caps,
// and gracefully reports { r2Available: false } when R2 bindings are not yet attached.

import { verifyToken } from './admin-login.js';
import { getActiveMediaShard, resolveR2BucketForShard } from './_edge-store.js';

const MAX_UPLOAD_BYTES = 1500 * 1024; // 1.5 MB ceiling per portrait

const MIME_TO_EXT = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
};

const JSON_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
};

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function extractAdminToken(request) {
    const auth = request.headers.get('Authorization') || request.headers.get('authorization') || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
    return (request.headers.get('X-Admin-Token') || request.headers.get('x-admin-token') || '').trim();
}

function decodeBase64ToBytes(dataUriOrBase64) {
    const str = String(dataUriOrBase64 || '').trim();
    let mimeType = 'image/jpeg';
    let b64 = str;

    const match = str.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/s);
    if (match) {
        mimeType = match[1].toLowerCase();
        b64 = match[2].replace(/\s+/g, '');
    } else {
        b64 = b64.replace(/\s+/g, '');
    }

    const ext = MIME_TO_EXT[mimeType];
    if (!ext) {
        throw new Error(`Unsupported image MIME type: ${mimeType}`);
    }

    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return { bytes, mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType, ext };
}

async function sha256HexBytes(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequest({ request, env }) {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: JSON_HEADERS });
    }
    if (request.method !== 'POST') {
        return json({ success: false, error: 'Method not allowed' }, 405);
    }

    const secret = env?.JWT_SECRET;
    const expectedUsername = env?.ADMIN_USERNAME || 'admin';
    if (!secret) {
        return json({ success: false, error: 'Server JWT_SECRET not configured' }, 500);
    }
    const token = extractAdminToken(request);
    const decoded = await verifyToken(token, secret, expectedUsername);
    if (!decoded) {
        return json({ success: false, error: 'Admin authentication required for media uploads' }, 401);
    }

    const activeShard = getActiveMediaShard(env);
    const bucket = activeShard ? resolveR2BucketForShard(env, activeShard) : null;
    if (!bucket) {
        // Non-fatal structured signal so admin UI cleanly falls back to inline compressed photo
        return json({
            success: false,
            r2Available: false,
            fallback: 'inline',
            error: 'R2 media bucket is not bound yet'
        }, 200);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ success: false, error: 'Invalid JSON payload' }, 400);
    }

    const dataUri = body?.dataUri || body?.photo || '';
    if (!dataUri || typeof dataUri !== 'string') {
        return json({ success: false, error: 'Image dataUri is required' }, 400);
    }

    // Fast pre-decode ceiling check to avoid excessive memory allocation in Worker
    if (dataUri.length > Math.ceil(MAX_UPLOAD_BYTES * 1.45) + 128) {
        return json({
            success: false,
            error: 'Image exceeds 1.5 MB upload limit'
        }, 413);
    }

    let parsed;
    try {
        parsed = decodeBase64ToBytes(dataUri);
    } catch (err) {
        return json({ success: false, error: err.message }, 400);
    }

    if (parsed.bytes.byteLength === 0) {
        return json({ success: false, error: 'Image cannot be empty' }, 400);
    }
    if (parsed.bytes.byteLength > MAX_UPLOAD_BYTES) {
        return json({
            success: false,
            error: `Image size (${Math.round(parsed.bytes.byteLength / 1024)} KB) exceeds 1.5 MB limit`
        }, 413);
    }

    const hash = await sha256HexBytes(parsed.bytes);
    const objectKey = `${hash}.${parsed.ext}`;

    // Content-addressed deduplication: avoid redundant R2 Class A PUT if hash already exists
    const existing = await bucket.head(objectKey);
    if (!existing) {
        await bucket.put(objectKey, parsed.bytes, {
            httpMetadata: {
                contentType: parsed.mimeType,
                cacheControl: 'public, max-age=31536000, immutable'
            },
            customMetadata: {
                martyrId: String(body?.martyrId || '').slice(0, 128),
                uploadedBy: String(decoded.username || 'admin').slice(0, 64),
                uploadedAt: new Date().toISOString()
            }
        });
    }

    return json({
        success: true,
        r2Available: true,
        deduplicated: Boolean(existing),
        photoPath: `/media/${activeShard}/${objectKey}`,
        photoHash: hash,
        photoShard: activeShard,
        sizeBytes: parsed.bytes.byteLength
    }, 200);
}
