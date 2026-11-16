// Shared Cloudflare R2 Media Helper for Baluch Martyrs Memorial
// Provides Base64 image decoding, SHA-256 content-addressed hashing,
// and deduplicated R2 shard uploads shared by /api/media-upload and Worker auto-backfill.

export const MAX_UPLOAD_BYTES = 1500 * 1024; // 1.5 MB ceiling per portrait

export const MIME_TO_EXT = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
};

export function resolveR2BucketForShard(env, shard) {
    const clean = String(shard || '').trim().toLowerCase();
    if (!clean || !env) return null;
    if (clean === 's1' || clean === '1') return env.MEDIA_S1 || null;
    if (clean === 's2' || clean === '2') return env.MEDIA_S2 || null;
    if (clean === 's3' || clean === '3') return env.MEDIA_S3 || null;
    const key = `MEDIA_${clean.toUpperCase()}`;
    return env[key] || null;
}

export function getActiveMediaShard(env) {
    const preferred = String(env?.ACTIVE_MEDIA_SHARD || 's1').trim().toLowerCase();
    if (resolveR2BucketForShard(env, preferred)) return preferred;
    for (const candidate of ['s1', 's2', 's3']) {
        if (resolveR2BucketForShard(env, candidate)) return candidate;
    }
    return '';
}

export function decodeBase64ToBytes(dataUriOrBase64) {
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

    const normalizedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
    const ext = MIME_TO_EXT[normalizedMime];
    if (!ext) {
        throw new Error(`Unsupported image MIME type: ${mimeType}`);
    }

    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return { bytes, mimeType: normalizedMime, ext };
}

export async function sha256HexBytes(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function storeImageBytesToActiveR2(env, { bytes, mimeType, ext, martyrId = '', uploadedBy = 'system' }) {
    const activeShard = getActiveMediaShard(env);
    const bucket = activeShard ? resolveR2BucketForShard(env, activeShard) : null;
    if (!bucket || !activeShard) {
        return { r2Available: false };
    }

    if (!bytes || bytes.byteLength === 0) {
        throw new Error('Image cannot be empty');
    }
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
        throw new Error(`Image size (${Math.round(bytes.byteLength / 1024)} KB) exceeds 1.5 MB limit`);
    }

    const resolvedMime = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
    const resolvedExt = ext || MIME_TO_EXT[resolvedMime];
    if (!resolvedExt) {
        throw new Error(`Unsupported image MIME type: ${mimeType}`);
    }

    const hash = await sha256HexBytes(bytes);
    const objectKey = `${hash}.${resolvedExt}`;

    // Content-addressed deduplication: avoid redundant R2 Class A PUT if hash already exists
    const existing = await bucket.head(objectKey);
    if (!existing) {
        await bucket.put(objectKey, bytes, {
            httpMetadata: {
                contentType: resolvedMime,
                cacheControl: 'public, max-age=31536000, immutable'
            },
            customMetadata: {
                martyrId: String(martyrId || '').slice(0, 128),
                uploadedBy: String(uploadedBy || 'system').slice(0, 64),
                uploadedAt: new Date().toISOString()
            }
        });
    }

    return {
        r2Available: true,
        deduplicated: Boolean(existing),
        photoPath: `/media/${activeShard}/${objectKey}`,
        photoHash: hash,
        photoShard: activeShard,
        sizeBytes: bytes.byteLength
    };
}
