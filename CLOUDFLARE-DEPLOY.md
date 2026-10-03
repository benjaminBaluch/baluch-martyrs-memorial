# Deploying to Cloudflare (baluchmartyrs.com)

Cloudflare **Workers + static assets** (the "import a repository" flow). `wrangler.jsonc` defines everything:
the site is built into `dist/`, only `dist/` is uploaded, and the Worker (`worker/index.js`) only runs for
`/api/*`. `functions/api/*.js` holds the handler code (also usable as classic Pages Functions).

## 1. Build settings
Worker → **Settings → Builds** (or the project setup screen):

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

Do **not** let Cloudflare auto-configure with output directory `.` – that uploads `node_modules` and fails with
"Asset too large". The `wrangler.jsonc` in this repo prevents that, as long as it is pushed to `main`.

The Worker name in `wrangler.jsonc` (`baluch-martyrs-memorial`) must match the Worker name in the dashboard.

## 2. Secrets (needed for admin login)
After the first successful deploy: Worker → **Settings → Variables and Secrets** → add as **Secret**
(plain-text variables set only in the dashboard are removed on the next deploy, secrets are kept):

| Name | Notes |
|---|---|
| `ADMIN_USERNAME` | Admin username |
| `ADMIN_PASSWORD_HASH` | SHA-256 hex of the admin password |
| `JWT_SECRET` | Long random string. Admin login returns an error if this is missing |

Copy the old values from Netlify (Site configuration → Environment variables).
Generate a hash: `printf '%s' 'YOUR_PASSWORD' | shasum -a 256`
`FIREBASE_SERVICE_ACCOUNT` (old Netlify functions) is **not needed** any more.

## 3. Custom domain
Worker → **Settings → Domains & Routes → Add → Custom domain**: `baluchmartyrs.com` and `www.baluchmartyrs.com`.
The domain must use Cloudflare DNS (change the nameservers at the registrar if needed).
Optional: Rules → **Redirect Rules** → redirect `www.baluchmartyrs.com` to `https://baluchmartyrs.com`.

## 4. Firebase / Google Cloud (required, or data will not load on the new domain)
- **Google Cloud Console → APIs & Services → Credentials → the Browser key** (`AIzaSyBW2J…`):
  if it has *HTTP referrer* restrictions, add `https://baluchmartyrs.com/*`, `https://www.baluchmartyrs.com/*`
  and `https://*.workers.dev/*` (for the preview URL).
- **Firebase Console → Authentication → Settings → Authorized domains**: add `baluchmartyrs.com`
  and `www.baluchmartyrs.com`.

## 5. After DNS has moved
- Delete `netlify.toml` and `netlify/` (no longer used).
- Redirect the old `baluchmartyrs.site` to `baluchmartyrs.com` with a 301.
- Rotate any GitHub tokens that were ever pasted into scripts or chats.

## Local testing
`npm run build && npx wrangler dev` → http://127.0.0.1:8787

## Notes
- `/about.html` redirects to `/about` automatically; unknown URLs return the custom `404.html` with a 404 status.
- Security/caching headers: `_headers`. API responses set their own headers in code.
- `/api/get-martyrs` is a **text-only** fallback (no photos). Photos are stored as base64 inside each Firestore
  document (~82 MB for all martyrs), which is also why the site is slow to load; moving photos to
  Firebase Storage would fix that.
