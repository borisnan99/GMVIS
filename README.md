# GMVIS
Greater Manchester Vis — community website for blind and partially sighted people across Greater Manchester.

## Pages
| File | Page |
|---|---|
| `index.html` | Home |
| `about.html` | About / Who We Are |
| `activities.html` | Activities (VI cricket, goalball, football, beep baseball, walks, socials) |
| `news.html` | News & Events |
| `blog.html` | Blog (posts loaded dynamically from the API) |
| `gallery.html` | Media gallery (images & videos from the API) |
| `get-involved.html` | Get Involved / Volunteer |
| `contact.html` | General enquiries form |
| `complaints.html` | Complaints form |
| `admin.html` | Admin portal (login-protected: manage blog posts & media) |

## Assets
Shared design system lives in `assets/`:
- `styles.css` — design tokens, components, accessibility themes (high-contrast, dyslexia font)
- `app.js` — accessibility toolbar, mobile nav, read-aloud, form validation
- `content.js` — renders the dynamic blog and gallery from the API
- `admin.js` / `admin.css` — the admin portal
- `falcon.svg`, `team-photo.jpg`, `team-photo-lg.jpg` — logo and team imagery

## Run locally

No build step required — it is a plain static site.

**Python (built-in):**
```bash
python3 -m http.server 8080
```

**Node (npx):**
```bash
npx serve .
```

**VS Code:** install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension, then click **Go Live** in the status bar.

Then open `http://localhost:8080` in your browser.

> The site must be served over HTTP (not opened as a `file://` URL) so that the accessibility toolbar's localStorage and the Web Speech API read-aloud work correctly.

## Admin portal & dynamic content (blogs + gallery)

The public site is static, but blog posts and gallery media (images **and** videos) are managed through a login-protected admin portal at **`/admin.html`** and stored by a small backend API.

> ⚠️ **Before deploying:** set a strong `ADMIN_PASSWORD` and a long random `SESSION_SECRET`. The defaults are for local development only — production values are SealedSecrets generated per [`docs/deployment-runbook.md`](docs/deployment-runbook.md).

**Architecture**

```
Browser ──► Node/Express ..... static site + /api/* + /media/*   [k8s: 1 replica]
                └── SQLite + uploads on a persistent volume (/data)
```

- **Backend** lives in [`server/`](server/): Express + Node's built-in `node:sqlite` (no native deps). It exposes the REST API, serves uploaded media with HTTP range support (so videos stream/seek), and — for local dev — can also serve the static site itself.
- **Auth** is a single shared password (`ADMIN_PASSWORD`). Login issues an HMAC-signed, httpOnly session cookie (`SESSION_SECRET`); all create/edit/delete routes require it.
- **Storage**: `DATA_DIR` holds `gmvis.db` (posts + media metadata) and an `uploads/` folder for the files.
- **Public pages** (`blog.html`, `gallery.html`) fetch from the API at runtime via [`assets/content.js`](assets/content.js). Drafts are hidden from the public; only published posts appear.

**Run the full stack locally**

```bash
cd server && npm install && cd ..
ADMIN_PASSWORD=secret SESSION_SECRET=dev-secret node server/src/index.js
```

Then open `http://localhost:3001` (whole site) and `http://localhost:3001/admin.html` (sign in with the password above). On Windows PowerShell:

```powershell
$env:ADMIN_PASSWORD="secret"; $env:SESSION_SECRET="dev-secret"; node server/src/index.js
```

**Environment variables**

| Var | Default | Purpose |
|---|---|---|
| `ADMIN_PASSWORD` | `admin` (dev only) | Admin login password — **set this** |
| `SESSION_SECRET` | insecure dev default | Signs session cookies — **set a long random value** |
| `PORT` | `3001` | API listen port |
| `DATA_DIR` | `server/data` | SQLite DB + uploads location |
| `SITE_DIR` | repo root | Static files to serve (standalone mode) |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS so cookies require TLS |

**API summary** — `POST /api/login` · `POST /api/logout` · `GET /api/session` · `GET/POST/PUT/DELETE /api/posts[/:id]` (`?all=1` includes drafts, auth) · `GET/POST/PUT/DELETE /api/assets[/:id]` · `GET /media/:file` · `GET /api/health`.

## Testing

End-to-end tests (Playwright + axe-core) cover functionality, navigation, forms and WCAG 2.1 AA accessibility across all pages:

```bash
npm install
npx playwright install chromium
npm test            # run the full suite
npm run test:report # open the HTML report
```

## Deployment

The site deploys to Kubernetes via **ArgoCD** with release-driven CI/CD.
One image — `ghcr.io/borisnan99/gmvis-web`, built from
[`server/Dockerfile`](server/Dockerfile) — serves the static site, the
`/api` routes, and uploaded `/media`.

- Publishing a **GitHub Release** builds the image and deploys it
  (`.github/workflows/deploy.yml` → ArgoCD app `gmvis-prod`,
  namespace `prod-gmvis`).
- The Helm chart lives in [`deploy/helm/gmvis/`](deploy/helm/gmvis/);
  secrets are committed as SealedSecrets.
- One-off cluster bootstrap (ArgoCD account, sealed secrets, first release):
  see [`docs/deployment-runbook.md`](docs/deployment-runbook.md).

Build and run the production image locally:

```bash
docker build -f server/Dockerfile -t gmvis-web:local .
docker run --rm -p 3001:3001 \
  -e ADMIN_PASSWORD=dev-password -e SESSION_SECRET=dev-secret-0123456789abcdef \
  -v gmvis-data:/data gmvis-web:local
# → http://localhost:3001
```
