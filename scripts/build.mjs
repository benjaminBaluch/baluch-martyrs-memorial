// Builds the deployable site into ./dist for Cloudflare Pages.
// Only public site files are copied, so docs, firestore.rules, package files and
// the old netlify/ sources are never served publicly. Uses Node built-ins only,
// so no `npm install` is needed.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'dist';

// Individual root files that the site needs (all root *.html files are added automatically)
const ROOT_FILES = ['_headers', 'favicon.svg', 'baluch-flag-logo.png', 'site.webmanifest', 'robots.txt'];
const DIRECTORIES = ['css', 'js', 'assets', 'images'];

const skipJunk = (src) => !src.endsWith('.DS_Store');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const htmlPages = readdirSync('.').filter((name) => name.endsWith('.html'));

for (const file of [...htmlPages, ...ROOT_FILES]) {
    if (!existsSync(file)) {
        console.warn(`! skipped missing file: ${file}`);
        continue;
    }
    cpSync(file, join(OUT, file));
}

for (const dir of DIRECTORIES) {
    if (!existsSync(dir)) {
        console.warn(`! skipped missing directory: ${dir}`);
        continue;
    }
    cpSync(dir, join(OUT, dir), { recursive: true, filter: skipJunk });
}

console.log(`Built ${htmlPages.length} pages + ${ROOT_FILES.length} root files + ${DIRECTORIES.length} folders into ${OUT}/`);
