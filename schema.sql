-- Cloudflare D1 Schema for Baluch Martyrs Memorial (Edge Read Replica)
-- Run manually once if preferred:
--   npx wrangler d1 execute baluch-martyrs-db --remote --file=./schema.sql
-- Also auto-created idempotently by functions/api/_edge-store.js on first request.

CREATE TABLE IF NOT EXISTS martyrs (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL DEFAULT '',
    full_name TEXT NOT NULL DEFAULT '',
    father_name TEXT NOT NULL DEFAULT '',
    birth_date_json TEXT NOT NULL DEFAULT '""',
    birth_place TEXT NOT NULL DEFAULT '',
    martyrdom_date_json TEXT NOT NULL DEFAULT '""',
    martyrdom_place TEXT NOT NULL DEFAULT '',
    biography TEXT NOT NULL DEFAULT '',
    family_details TEXT NOT NULL DEFAULT '',
    organization TEXT NOT NULL DEFAULT '',
    affiliation TEXT NOT NULL DEFAULT '',
    rank TEXT NOT NULL DEFAULT '',
    photo_path TEXT NOT NULL DEFAULT '',
    photo_hash TEXT NOT NULL DEFAULT '',
    photo_shard TEXT NOT NULL DEFAULT '',
    photo_removed INTEGER NOT NULL DEFAULT 0,
    has_photo INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'approved',
    submitted_at_json TEXT NOT NULL DEFAULT '""',
    approved_at_json TEXT NOT NULL DEFAULT '""',
    updated_at_json TEXT NOT NULL DEFAULT '""',
    photo_updated_at_json TEXT NOT NULL DEFAULT '""',
    deleted_at_json TEXT NOT NULL DEFAULT '""',
    submitted_at_ms INTEGER NOT NULL DEFAULT 0,
    approved_at_ms INTEGER NOT NULL DEFAULT 0,
    updated_at_ms INTEGER NOT NULL DEFAULT 0,
    photo_updated_at_ms INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_martyrs_status_approved
    ON martyrs (status, approved_at_ms DESC, id ASC);

CREATE INDEX IF NOT EXISTS idx_martyrs_updated
    ON martyrs (updated_at_ms ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_martyrs_slug
    ON martyrs (slug);

CREATE INDEX IF NOT EXISTS idx_martyrs_name_lower
    ON martyrs (LOWER(full_name));

CREATE TABLE IF NOT EXISTS archive_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at_ms INTEGER NOT NULL
);
