// Sovereign Nightly Archive Backup Script (Zero External Dependencies, Node >= 18)
// Exports a portable JSON archive + SHA-256 integrity manifest outside Firebase & Cloudflare.
// Usage: node scripts/backup-archive.mjs [--out=./backups] [--site=https://baluchmartyrs.com]

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'baluch-martyrs-memorial';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBW2JKt68kGKE-CMvKQUUj33ToZ8M-kGII';

const args = process.argv.slice(2);
const outArg = args.find((a) => a.startsWith('--out='));
const siteArg = args.find((a) => a.startsWith('--site='));
const OUT_DIR = outArg ? outArg.slice(6) : join(process.cwd(), 'backups');
const SITE_URL = siteArg ? siteArg.slice(7).replace(/\/+$/, '') : 'https://baluchmartyrs.com';

const BACKUP_FIELDS = [
    'id', 'fullName', 'fatherName', 'birthDate', 'birthPlace', 'martyrdomDate',
    'martyrdomPlace', 'biography', 'familyDetails', 'organization', 'affiliation', 'rank',
    'photoPath', 'photoHash', 'photoShard', 'photoRemoved', 'hasPhoto',
    'submittedAt', 'approvedAt', 'updatedAt', 'photoUpdatedAt', 'deletedAt', 'status'
];

function decodeRestValue(v) {
    if (!v || typeof v !== 'object') return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('nullValue' in v) return null;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeRestValue);
    if ('mapValue' in v) return decodeRestFields(v.mapValue.fields || {});
    return null;
}

function decodeRestFields(fields) {
    const out = {};
    for (const [k, v] of Object.entries(fields)) out[k] = decodeRestValue(v);
    return out;
}

async function fetchEdgeArchiveSnapshot() {
    const res = await fetch(`${SITE_URL}/api/edge-archive?mode=full`, {
        headers: { Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`Edge archive HTTP ${res.status}`);
    const payload = await res.json();
    if (!Array.isArray(payload?.data) || payload.data.length === 0) {
        throw new Error('Edge archive returned empty dataset');
    }
    return { source: `edge:${payload.edgeMode || 'cache'}`, records: payload.data };
}

async function fetchFirestoreDirectSnapshot() {
    const records = [];
    let pageToken = '';
    do {
        const params = new URLSearchParams({ pageSize: '300', key: API_KEY });
        for (const f of BACKUP_FIELDS) params.append('mask.fieldPaths', f);
        if (pageToken) params.set('pageToken', pageToken);

        const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(PROJECT_ID)}/databases/(default)/documents/martyrs?${params}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`Firestore REST HTTP ${res.status}`);
        const page = await res.json();
        for (const doc of page.documents || []) {
            const docId = doc.name.split('/').pop();
            const parsed = decodeRestFields(doc.fields || {});
            records.push({ ...parsed, id: docId, status: parsed.status || 'approved' });
        }
        pageToken = page.nextPageToken || '';
    } while (pageToken);
    return { source: 'firestore-rest', records };
}

async function main() {
    mkdirSync(OUT_DIR, { recursive: true });
    let snapshot;
    try {
        snapshot = await fetchFirestoreDirectSnapshot();
    } catch (fsErr) {
        console.warn(`Firestore REST backup skipped (${fsErr.message}), trying Edge archive...`);
        snapshot = await fetchEdgeArchiveSnapshot();
    }

    const active = snapshot.records.filter((r) => !r.status || r.status === 'approved');
    const tombstones = snapshot.records.filter((r) => r.status === 'deleted');
    const dateStamp = new Date().toISOString().slice(0, 10);

    const backupObj = {
        format: 'bmm-sovereign-backup-v1',
        createdAt: new Date().toISOString(),
        source: snapshot.source,
        counts: {
            total: snapshot.records.length,
            approved: active.length,
            tombstones: tombstones.length
        },
        records: snapshot.records
    };

    const jsonText = JSON.stringify(backupObj, null, 2);
    const sha256 = createHash('sha256').update(jsonText).digest('hex');

    const jsonFile = join(OUT_DIR, `bmm-archive-${dateStamp}.json`);
    const manifestFile = join(OUT_DIR, `bmm-archive-${dateStamp}.sha256.json`);

    writeFileSync(jsonFile, jsonText, 'utf8');
    writeFileSync(manifestFile, JSON.stringify({
        file: `bmm-archive-${dateStamp}.json`,
        bytes: Buffer.byteLength(jsonText, 'utf8'),
        sha256,
        createdAt: backupObj.createdAt,
        counts: backupObj.counts
    }, null, 2), 'utf8');

    console.log(`Backup written: ${jsonFile} (${active.length} approved, ${tombstones.length} tombstones, sha256=${sha256.slice(0, 16)}...)`);
}

main().catch((err) => {
    console.error('Backup failed:', err);
    process.exit(1);
});
