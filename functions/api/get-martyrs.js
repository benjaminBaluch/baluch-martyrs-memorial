// Cloudflare Pages Function: GET /api/get-martyrs
// Fallback used by gallery.js / statistics.js when the browser cannot reach
// Firestore directly. The Netlify version used firebase-admin, which does not
// run on Cloudflare Workers, so this reads Firestore through its REST API.
// The 'martyrs' collection is publicly readable (see firestore.rules), so no
// service account is needed.

const PROJECT_ID = 'baluch-martyrs-memorial';
// Public web API key (the same one shipped in js/firebase-config.js)
const DEFAULT_API_KEY = 'AIzaSyBW2JKt68kGKE-CMvKQUUj33ToZ8M-kGII';

// Only these fields are exposed (keeps submitter contact details private)
const PUBLIC_FIELDS = [
    'id', 'fullName', 'fatherName', 'birthDate', 'birthPlace', 'martyrdomDate',
    'martyrdomPlace', 'biography', 'organization', 'rank', 'familyDetails',
    'photo', 'submittedAt', 'approvedAt', 'status'
];

const HEADERS = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*'
};

// Convert a Firestore REST typed value into plain JSON
function fromValue(value) {
    if (!value || typeof value !== 'object') return null;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('timestampValue' in value) return value.timestampValue; // ISO 8601 string
    if ('nullValue' in value) return null;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromValue);
    if ('mapValue' in value) return fromFields(value.mapValue.fields || {});
    if ('referenceValue' in value) return value.referenceValue;
    if ('geoPointValue' in value) return value.geoPointValue;
    if ('bytesValue' in value) return value.bytesValue;
    return null;
}

function fromFields(fields) {
    const out = {};
    for (const [key, value] of Object.entries(fields)) out[key] = fromValue(value);
    return out;
}

export async function onRequest({ request, env }) {
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: { ...HEADERS, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
        });
    }
    if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: HEADERS });
    }

    const apiKey = env.FIREBASE_API_KEY || DEFAULT_API_KEY;
    const martyrs = [];

    try {
        let pageToken = '';
        do {
            const params = new URLSearchParams({ pageSize: '50', key: apiKey });
            for (const field of PUBLIC_FIELDS) params.append('mask.fieldPaths', field);
            if (pageToken) params.set('pageToken', pageToken);

            const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/martyrs?${params}`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Firestore REST responded ${response.status}`);
            }

            const page = await response.json();
            for (const doc of page.documents || []) {
                const data = fromFields(doc.fields || {});
                // Same rule as the browser code: a missing status counts as approved
                if (data.status && data.status !== 'approved') continue;

                const publicData = {};
                for (const field of PUBLIC_FIELDS) {
                    if (data[field] !== undefined) publicData[field] = data[field];
                }
                martyrs.push({ ...publicData, id: data.id || doc.name.split('/').pop(), status: 'approved' });
            }
            pageToken = page.nextPageToken || '';
        } while (pageToken);

        // Newest approvals first, like the original orderBy('approvedAt', 'desc')
        martyrs.sort((a, b) => String(b.approvedAt || '').localeCompare(String(a.approvedAt || '')));

        return new Response(JSON.stringify(martyrs), { status: 200, headers: HEADERS });
    } catch (error) {
        console.error('get-martyrs failed:', error);
        return new Response(JSON.stringify({ error: 'Database error' }), { status: 502, headers: HEADERS });
    }
}
