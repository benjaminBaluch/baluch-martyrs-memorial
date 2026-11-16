// Cloudflare Worker / Pages Function: POST /api/media-upload
// Admin-only content-addressed media upload into sharded R2 buckets (MEDIA_S1, MEDIA_S2, ...).
// Deduplicates via SHA-256 content hash, enforces strict image validation & size caps,
// and gracefully reports { r2Available: false } when R2 bindings are not yet attached.

import { authorizeAdmin, JSON_HEADERS, jsonResponse as json } from './_admin-auth.js';
import {
    decodeBase64ToBytes,
    getActiveMediaShard,
    MAX_UPLOAD_BYTES,
    resolveR2BucketForShard,
    storeImageBytesToActiveR2
} from './_media-helper.js';

export async function onRequest({ request, env }) {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: JSON_HEADERS });
    }
    if (request.method !== 'POST') {
        return json({ success: false, error: 'Method not allowed' }, 405);
    }

    const auth = await authorizeAdmin(request, env, {
        missingSecretError: 'Server JWT_SECRET not configured',
        missingTokenError: 'Admin authentication required for media uploads',
        invalidTokenError: 'Admin authentication required for media uploads'
    });
    if (!auth.ok) {
        return json({ success: false, error: auth.error }, auth.status);
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

    let result;
    try {
        result = await storeImageBytesToActiveR2(env, {
            bytes: parsed.bytes,
            mimeType: parsed.mimeType,
            ext: parsed.ext,
            martyrId: body?.martyrId,
            uploadedBy: auth.decoded?.username || 'admin'
        });
    } catch (err) {
        const msg = String(err?.message || 'Upload failed');
        const status = msg.includes('exceeds 1.5 MB limit') ? 413 : 400;
        return json({ success: false, error: msg }, status);
    }

    if (!result.r2Available) {
        return json({
            success: false,
            r2Available: false,
            fallback: 'inline',
            error: 'R2 media bucket is not bound yet'
        }, 200);
    }

    return json({
        success: true,
        r2Available: true,
        deduplicated: result.deduplicated,
        photoPath: result.photoPath,
        photoHash: result.photoHash,
        photoShard: result.photoShard,
        sizeBytes: result.sizeBytes
    }, 200);
}
