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

> ⚠️ **Before deploying:** set a strong `ADMIN_PASSWORD` and a long random `SESSION_SECRET`. The defaults are for local development only, and `k8s/api-secret.yaml` ships with placeholders — change them, or create the secret with `kubectl create secret` (see [Kubernetes](#kubernetes)).

**Architecture**

```
Browser ─┬─► nginx ............ static site (HTML/CSS/JS)        [k8s: 2 replicas]
         ├─► Node/Express ..... /api/*  (blogs, media, auth)     [k8s: 1 replica]
         └─► Node/Express ..... /media/* (uploaded files, range-enabled)
                               └─ SQLite DB + uploaded files on a persistent volume
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

## Docker

The site ships as a small (~77 MB) nginx image that runs as a **non-root** user on port **8080** and works with a **read-only root filesystem**.

```bash
# Build
docker build -t gmvis:latest .

# Run locally (mimicking the production hardening)
docker run --rm -p 8080:8080 \
  --user 101:101 --read-only --tmpfs /tmp --tmpfs /var/cache/nginx \
  gmvis:latest
```

Then open `http://localhost:8080`. A health endpoint is exposed at `/healthz`.

Server config (gzip, long-lived asset caching, security headers, pretty URLs, branded `404.html`) lives in [`nginx/default.conf`](nginx/default.conf).

### API image

The admin API is a second image (Node, non-root, read-only-root compatible), built from the repo root:

```bash
docker build -f server/Dockerfile -t gmvis-api:latest .

# Run it (serves the whole site + API + media on :3001)
docker run --rm -p 3001:3001 \
  --read-only --tmpfs /tmp -v gmvis-data:/data \
  -e ADMIN_PASSWORD=secret -e SESSION_SECRET=dev-secret \
  gmvis-api:latest
```

The SQLite DB and uploaded media live in the `/data` volume, so they survive restarts.

### Push to a registry

```bash
docker tag gmvis:latest     <registry>/gmvis:1.0.0       # static site (nginx)
docker tag gmvis-api:latest <registry>/gmvis-api:1.0.0   # admin API (node)
docker push <registry>/gmvis:1.0.0
docker push <registry>/gmvis-api:1.0.0
```

## Kubernetes

Manifests live in [`k8s/`](k8s/):

| Resource | Purpose |
|---|---|
| `deployment.yaml` / `service.yaml` | Static site (nginx), 2 replicas |
| `api-deployment.yaml` / `api-service.yaml` | Admin API (Node), 1 replica, `Recreate` strategy |
| `api-pvc.yaml` | `ReadWriteOnce` volume for the SQLite DB + uploaded media |
| `api-secret.yaml` | `ADMIN_PASSWORD` + `SESSION_SECRET` |
| `ingress.yaml` | Routes `/api` and `/media` → API, everything else → nginx |

1. Set your images (kustomize):
   ```bash
   cd k8s
   kustomize edit set image gmvis=<registry>/gmvis:1.0.0
   kustomize edit set image gmvis-api=<registry>/gmvis-api:1.0.0
   cd ..
   ```
2. Set the admin secret. **Edit the placeholders in `k8s/api-secret.yaml`**, or (preferred) create it out-of-band and drop it from the kustomization:
   ```bash
   kubectl create secret generic gmvis-api-secret \
     --from-literal=ADMIN_PASSWORD='your-strong-password' \
     --from-literal=SESSION_SECRET="$(openssl rand -hex 32)"
   ```
3. Set your domain and ingress class in `k8s/ingress.yaml` (replace `gmvis.example.com` and `ingressClassName`). The ingress already raises `proxy-body-size` to 200 MB for video uploads.
4. Deploy and check rollout:
   ```bash
   kubectl apply -k k8s/
   kubectl rollout status deployment/gmvis-web
   kubectl rollout status deployment/gmvis-api
   ```

Both deployments run as non-root with `runAsNonRoot`, `readOnlyRootFilesystem`, all Linux capabilities dropped, and `seccompProfile: RuntimeDefault`. The nginx pods use `emptyDir` volumes at `/tmp` and `/var/cache/nginx`; the API pod mounts the persistent volume at `/data` (plus an `emptyDir` `/tmp`).
