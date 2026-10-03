# Deploying to Cloudflare Pages (baluchmartyrs.com)

The site is static HTML/CSS/JS plus two Pages Functions in `functions/api/`.
`npm run build` copies only the public files into `dist/`.

## 1. Create the Pages project
Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** →
select `benjaminBaluch/baluch-martyrs-memorial`, branch `main`.

| Setting | Value |
|---|---|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` (leave empty) |

If the repo is missing from the list: GitHub → Settings → Applications → *Cloudflare Workers and Pages* →
Configure → **Repository access** → add the repo → **Save**.

## 2. Environment variables
Pages project → **Settings → Variables and Secrets** (add to **Production** and **Preview**).
Copy the old values from Netlify (Site configuration → Environment variables).

| Name | Type | Notes |
|---|---|---|
| `ADMIN_USERNAME` | Text | Admin username |
| `ADMIN_PASSWORD_HASH` | **Secret** | SHA-256 hex of the admin password |
| `JWT_SECRET` | **Secret** | Long random string. Admin login returns an error if this is missing |
| `SKIP_DEPENDENCY_INSTALL` | Text | `1` (the build uses only Node built-ins, so skipping `npm install` is faster) |

`FIREBASE_SERVICE_ACCOUNT` (used by the old Netlify functions) is **not needed** any more.

Generate a password hash: `printf '%s' 'YOUR_PASSWORD' | shasum -a 256`

## 3. Custom domain
Pages project → **Custom domains** → add `baluchmartyrs.com` and `www.baluchmartyrs.com`.
The domain must use Cloudflare DNS (change the nameservers at the registrar if needed).
Optional: Rules → **Redirect Rules** → redirect `www.baluchmartyrs.com` to `https://baluchmartyrs.com`.

## 4. Firebase / Google Cloud (required, or data will not load on the new domain)
- **Google Cloud Console → APIs & Services → Credentials → the Browser key** (`AIzaSyBW2J…`):
  if it has *HTTP referrer* restrictions, add
  `https://baluchmartyrs.com/*`, `https://www.baluchmartyrs.com/*` and `https://*.pages.dev/*`.
- **Firebase Console → Authentication → Settings → Authorized domains**: add `baluchmartyrs.com`
  and `www.baluchmartyrs.com`.

## 5. After DNS has moved
- Delete `netlify.toml` and `netlify/` (they are no longer used).
- Redirect the old `baluchmartyrs.site` to `baluchmartyrs.com` with a 301 (Cloudflare Redirect Rule if
  the `.site` domain is also on Cloudflare).
- Rotate any GitHub tokens that were ever pasted into scripts or chats.

## Notes
- `.html` URLs redirect to clean URLs automatically on Pages, so the old Netlify redirect rules are not needed.
- Security/caching headers live in `_headers`; the custom 404 page is `404.html`.
- API routes: `/api/admin-login`, `/api/get-martyrs` (other Netlify functions were not used by the site).
