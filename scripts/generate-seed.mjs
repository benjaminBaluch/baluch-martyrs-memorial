// Generates clean, fast assets/martyrs-seed.json from live Firestore
// Also syncs static portraits in assets/photos/[id].jpg for any newly approved martyrs
// Photos are served statically from /assets/photos/[id].jpg with native lazy-loading.

import { writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ID = 'baluch-martyrs-memorial';
const API_KEY = 'AIzaSyBW2JKt68kGKE-CMvKQUUj33ToZ8M-kGII';
const OUT_PATH = join(process.cwd(), 'assets', 'martyrs-seed.json');
const PHOTOS_DIR = join(process.cwd(), 'assets', 'photos');

const PUBLIC_FIELDS = [
    'id', 'fullName', 'fatherName', 'birthDate', 'birthPlace', 'martyrdomDate',
    'martyrdomPlace', 'biography', 'organization', 'rank', 'familyDetails',
    'submittedAt', 'approvedAt', 'updatedAt', 'status'
];

function fromValue(value) {
    if (!value || typeof value !== 'object') return null;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('timestampValue' in value) {
        const ms = Date.parse(value.timestampValue);
        if (!isNaN(ms)) {
            return {
                __bmmTimestamp: true,
                seconds: Math.floor(ms / 1000),
                nanoseconds: (ms % 1000) * 1e6
            };
        }
        return value.timestampValue;
    }
    if ('nullValue' in value) return null;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromValue);
    if ('mapValue' in value) return fromFields(value.mapValue.fields || {});
    return null;
}

function fromFields(fields) {
    const out = {};
    for (const [k, v] of Object.entries(fields)) {
        out[k] = fromValue(v);
    }
    return out;
}

function toMillis(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val < 1e11 ? val * 1000 : val;
    if (typeof val === 'string') {
        const p = Date.parse(val);
        return isNaN(p) ? 0 : p;
    }
    if (typeof val === 'object' && typeof val.seconds === 'number') {
        return val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1e6);
    }
    return 0;
}

async function fetchAndSaveMissingPhoto(docId) {
    const photoPath = join(PHOTOS_DIR, `${docId}.jpg`);
    if (existsSync(photoPath)) return true;

    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/martyrs/${encodeURIComponent(docId)}?mask.fieldPaths=photo&key=${API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return false;
    const doc = await res.json();
    const photoStr = doc?.fields?.photo?.stringValue || '';
    if (!photoStr || !photoStr.startsWith('data:image/')) return false;

    const commaIdx = photoStr.indexOf(',');
    if (commaIdx === -1) return false;
    const base64Data = photoStr.slice(commaIdx + 1);
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length === 0) return false;

    writeFileSync(photoPath, buffer);
    return true;
}

async function main() {
    mkdirSync(PHOTOS_DIR, { recursive: true });
    console.log('Fetching live approved martyrs from Firestore REST API...');
    let pageToken = '';
    let rawCollectionSize = 0;
    let maxServerUpdateMs = 0;
    const martyrs = [];
    const activeIds = new Set();

    do {
        const params = new URLSearchParams({ pageSize: '300', key: API_KEY });
        for (const f of PUBLIC_FIELDS) params.append('mask.fieldPaths', f);
        if (pageToken) params.set('pageToken', pageToken);

        const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/martyrs?${params}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Firestore REST error: ${res.status}`);
        const page = await res.json();
        const docs = page.documents || [];
        rawCollectionSize += docs.length;

        for (const doc of docs) {
            const data = fromFields(doc.fields || {});
            if (data.status && data.status !== 'approved') continue;
            const docId = doc.name.split('/').pop();
            activeIds.add(docId);

            if (doc.updateTime) {
                const uMs = Date.parse(doc.updateTime);
                if (!isNaN(uMs) && uMs > maxServerUpdateMs) maxServerUpdateMs = uMs;
            }

            martyrs.push({
                ...data,
                id: docId,
                status: 'approved',
                hasPhoto: true
            });
        }
        pageToken = page.nextPageToken || '';
    } while (pageToken);

    // Ensure static photos exist for all approved martyrs
    let downloadedPhotos = 0;
    for (const m of martyrs) {
        const photoPath = join(PHOTOS_DIR, `${m.id}.jpg`);
        if (!existsSync(photoPath)) {
            const saved = await fetchAndSaveMissingPhoto(m.id);
            if (saved) {
                downloadedPhotos++;
                m.hasPhoto = true;
            } else {
                m.hasPhoto = false;
            }
        }
    }
    if (downloadedPhotos > 0) {
        console.log(`Saved ${downloadedPhotos} new static martyr portraits to assets/photos/`);
    }

    // Remove orphaned static photos for deleted documents
    const existingFiles = readdirSync(PHOTOS_DIR);
    let removedPhotos = 0;
    for (const file of existingFiles) {
        if (!file.endsWith('.jpg')) continue;
        const id = file.slice(0, -4);
        if (!activeIds.has(id)) {
            unlinkSync(join(PHOTOS_DIR, file));
            removedPhotos++;
        }
    }
    if (removedPhotos > 0) {
        console.log(`Removed ${removedPhotos} orphaned photo(s) from assets/photos/`);
    }

    let maxApprovedMs = 0;
    let maxUpdatedMs = 0;
    for (const m of martyrs) {
        const appMs = toMillis(m.approvedAt) || toMillis(m.submittedAt);
        const updMs = toMillis(m.updatedAt) || appMs;
        if (appMs > maxApprovedMs) maxApprovedMs = appMs;
        if (updMs > maxUpdatedMs) maxUpdatedMs = updMs;
    }

    const authoritativeWatermarkMs = maxServerUpdateMs || maxUpdatedMs || maxApprovedMs || Date.now();
    const payload = {
        version: 2,
        rawCollectionSize,
        maxApprovedMs: maxApprovedMs || authoritativeWatermarkMs,
        maxUpdatedMs: maxUpdatedMs || authoritativeWatermarkMs,
        syncedAt: authoritativeWatermarkMs,
        fullSyncAt: authoritativeWatermarkMs,
        data: martyrs
    };

    mkdirSync(join(process.cwd(), 'assets'), { recursive: true });
    const jsonString = JSON.stringify(payload);
    writeFileSync(OUT_PATH, jsonString, 'utf8');
    console.log(`Saved ${martyrs.length} martyrs to ${OUT_PATH} (${(jsonString.length / 1024).toFixed(1)} KB)`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
