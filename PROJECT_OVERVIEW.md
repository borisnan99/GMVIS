# Greater Manchester Vis (GMVIS) — Project Overview

> A single-file briefing for handing to an AI assistant (or a new teammate). It
> describes what this project is, how it's built, how to run/test/deploy it, and
> the conventions and gotchas to know before changing anything.

---

## 1. What this is

**Greater Manchester Vis (GMVIS)** is the website for a community group that runs
**inclusive sport for blind and partially sighted people** across Greater
Manchester (the "Greater Manchester Falcons" play VI cricket, goalball, football,
beep baseball, plus guided walks and socials).

The **primary audience is blind / low-vision users and screen-reader users**, so
**accessibility (WCAG 2.1 AA) is the top priority** in every decision.

The project has two parts:

1. **A static, accessible multi-page website** (HTML/CSS/JS, no build step) served
   by **nginx**.
2. **A small backend (Node/Express)** powering a **login-protected admin portal**
   for managing **blog posts** and a **media gallery** (images *and* uploaded
   videos), plus the public pages that display that content.

- **Repository:** `github.com/borisnan99/GMVIS` (default branch `main`).
- **Deployment target:** Kubernetes (Docker images for both the static site and
  the API).
- **Status:** feature-complete; 119 Playwright tests passing; merged to `main`.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Static frontend | Plain HTML + CSS + vanilla JS | **No framework, no build step** |
| Fonts | Outfit (headings), Atkinson Hyperlegible (body), Lexend (dyslexia toggle) | Atkinson is designed for low vision |
| Backend | Node.js 24 + Express 4 | CommonJS |
| Database | **`node:sqlite`** (Node's built-in SQLite) | No native deps; experimental flag, warning suppressed |
| File uploads | `multer` | Disk storage, 200 MB limit |
| Auth | Shared password → HMAC-signed httpOnly cookie | `node:crypto`, no JWT lib |
| Forms (contact/complaints/newsletter) | **Web3Forms** | Access key is public/client-side (safe to embed) |
| Tests | **Playwright + `@axe-core/playwright`** | 119 tests |
| Static image | `nginxinc/nginx-unprivileged:1.27-alpine` | non-root, read-only-root |
| API image | `node:24-slim` | non-root (uid 1000), read-only-root |
| Orchestration | Kubernetes + Kustomize | `k8s/` |

---

## 3. Repository layout

```
/                              repo root (static site is served from here)
├── index.html                 Home
├── about.html                 About / who we are
├── activities.html            Activities (VI cricket, goalball, football, …)
├── news.html                  News & events (semantic <time> event list)
├── blog.html                  Blog — renders posts dynamically from the API
├── gallery.html               Media gallery — images/videos from the API
├── get-involved.html          Membership / volunteering
├── contact.html               Enquiry form (Web3Forms)
├── complaints.html            Complaints form (Web3Forms)
├── 404.html                   Branded, accessible not-found page (root-relative links)
├── admin.html                 ADMIN PORTAL (login-protected): manage posts & media
│
├── assets/
│   ├── styles.css             Design system: tokens, components, a11y themes, gallery
│   ├── app.js                 A11y toolbar, mobile nav, read-aloud, Web3Forms submit
│   ├── content.js             Renders dynamic blog (#blog-posts) and gallery (#gallery-grid)
│   ├── admin.js               Admin portal logic (login + posts/media CRUD)
│   ├── admin.css              Admin portal styles
│   ├── falcon-bird.svg, falcon-lockup.svg, falcon.svg   logos
│   └── team-photo.jpg, team-photo-lg.jpg
│
├── uploads/                   Pre-existing static team photos (NOT the admin uploads)
│
├── server/                    BACKEND (admin API)
│   ├── src/
│   │   ├── index.js           Express app: routes, multer, media static, static site
│   │   ├── db.js              node:sqlite setup + schema (posts, assets)
│   │   └── auth.js            password check, cookie sign/verify, requireAuth middleware
│   ├── package.json           deps: express, multer
│   ├── package-lock.json
│   └── Dockerfile             API image (build from repo root: -f server/Dockerfile)
│
├── tests/                     Playwright specs
│   ├── accessibility.spec.js  axe WCAG 2.1 AA on every page + structural checks
│   ├── navigation.spec.js     nav, hamburger, aria-current, footer links, skip link
│   ├── forms.spec.js          Web3Forms contact/complaints/newsletter (mocked)
│   ├── functionality.spec.js  a11y toolbar, read-aloud, blog filter pills, etc.
│   ├── api.spec.js            API: auth, post lifecycle, asset upload/range/delete
│   ├── admin.spec.js          Admin UI: login, tabs, post CRUD, media upload
│   ├── public-content.spec.js Dynamic blog + gallery rendering and filters
│   └── global-setup.js        Wipes the test data dir before each run
│
├── k8s/                       Kubernetes manifests (apply with: kubectl apply -k k8s/)
│   ├── deployment.yaml        nginx static site (2 replicas)
│   ├── service.yaml           nginx ClusterIP
│   ├── api-deployment.yaml    Node API (1 replica, Recreate)
│   ├── api-service.yaml       API ClusterIP
│   ├── api-pvc.yaml           ReadWriteOnce volume for DB + uploads
│   ├── api-secret.yaml        ADMIN_PASSWORD + SESSION_SECRET (PLACEHOLDERS — change!)
│   ├── ingress.yaml           /api + /media → API; everything else → nginx
│   └── kustomization.yaml     ties it together; sets image tags
│
├── nginx/default.conf         nginx server block (gzip, caching, security headers, 404)
├── Dockerfile                 STATIC SITE image (nginx)
├── .dockerignore  .gitignore
├── playwright.config.js       runs the Node server as the test web server (port 3000)
├── package.json               root — Playwright tooling only
├── README.md                  user-facing docs
├── LICENSE
└── script.js, styles.css      LEGACY root files, unused — excluded from images
```

---

## 4. Accessibility model (the heart of the project)

Every page includes:

- **Skip-to-main link** (`a.skip` → `#main`).
- **Accessibility toolbar** (floating button, built by `app.js`): text size (4 levels),
  high-contrast black/gold theme, dyslexia-friendly font (Lexend), reduce-motion.
  All settings persist in **`localStorage`** (`gmvis.a11y.v1`) and apply via
  `data-*` attributes on `<html>` (`data-contrast`, `data-dys`, `data-motion`,
  `--fs-scale`).
- **Read-aloud** buttons on page intros using the **Web Speech API**.
- **Mobile nav**: hamburger toggles `.menu` with `aria-expanded`, `aria-controls`,
  and `aria-hidden` managed by viewport (`app.js wireNav()`).
- Thorough **ARIA**: `aria-current="page"`, `aria-pressed` on filter pills,
  `role="group"`/`dialog`/`status`/`alert`, `aria-live`, decorative SVGs/images
  marked `aria-hidden`, semantic `<time datetime>` with visually-hidden full dates,
  `<dl>` stats, etc.

**Design tokens** (in `styles.css`): `--paper #FBF8F1`, `--ink #1C1430`,
`--purple-600 #4A2785`, brand gold gradient `#FFF3A6 → #F9DF7B → #B57E10`.

---

## 5. Backend / admin system

### Architecture
```
Browser ─┬─► nginx ............ static site (HTML/CSS/JS)        [k8s: 2 replicas]
         ├─► Node/Express ..... /api/*  (blogs, media, auth)     [k8s: 1 replica]
         └─► Node/Express ..... /media/* (uploaded files, HTTP range support)
                               └─ SQLite DB + uploaded files on a persistent volume
```
For **local dev**, the Node server can also serve the static site itself, so a
single `node server/src/index.js` serves everything on one port.

### Auth
- Single **shared password** in `ADMIN_PASSWORD` (constant-time compare).
- On login, an **HMAC-signed, time-limited (12h) token** is set as an httpOnly
  cookie `gmvis_admin` (signed with `SESSION_SECRET`). No server-side sessions.
- All create/edit/delete routes use `requireAuth`. Login is rate-limited.

### Data model (SQLite)
- **`posts`**: `id, title, category, author, excerpt, body, cover_asset_id,
  published, created_at, updated_at`
- **`assets`**: `id, kind ('image'|'video'), filename, original_name, mime, size,
  title, caption, created_at`

### REST API (all under `/api`)
| Method & path | Auth | Purpose |
|---|---|---|
| `GET /api/health` | – | Liveness/readiness |
| `GET /api/session` | – | `{ authenticated }` |
| `POST /api/login` | – | `{ password }` → sets cookie |
| `POST /api/logout` | – | clears cookie |
| `GET /api/posts` | – | published posts; `?all=1` + auth includes drafts |
| `GET /api/posts/:id` | – | single (drafts hidden unless authed) |
| `POST /api/posts` | ✓ | create |
| `PUT /api/posts/:id` | ✓ | update |
| `DELETE /api/posts/:id` | ✓ | delete |
| `GET /api/assets` | – | list; `?kind=image|video` filter |
| `POST /api/assets` | ✓ | multipart upload (`file`, `title`, `caption`) |
| `PUT /api/assets/:id` | ✓ | edit title/caption |
| `DELETE /api/assets/:id` | ✓ | delete (also removes file from disk) |
| `GET /media/:file` | – | serve uploaded file (supports `Range` → 206) |

Allowed uploads: images (jpg, png, webp, gif, avif, svg) and video (mp4, webm,
ogg, mov), up to **200 MB**.

### Public display
- `blog.html` (`#blog-posts`) and `gallery.html` (`#gallery-grid`) fetch from the
  API at runtime via `content.js`. Category/kind **filter pills** are wired there.
- **Drafts are never shown publicly.** Blog post bodies render inside an accessible
  `<details>` disclosure.

### Environment variables
| Var | Default | Purpose |
|---|---|---|
| `ADMIN_PASSWORD` | `admin` (dev only) | **Set this** — admin login |
| `SESSION_SECRET` | insecure dev default | **Set a long random value** — cookie signing |
| `PORT` | `3001` | API port |
| `DATA_DIR` | `server/data` | SQLite DB + `uploads/` |
| `SITE_DIR` | repo root | Static files to serve (standalone mode) |
| `COOKIE_SECURE` | `false` | `true` behind HTTPS (cookies require TLS) |
| `NODE_ENV` | – | `production` in the image |

---

## 6. How to run, test, and deploy

### Run the full stack locally
```bash
cd server && npm install && cd ..
ADMIN_PASSWORD=admin123 SESSION_SECRET=local-dev-secret node server/src/index.js
# → whole site:  http://localhost:3001
# → admin:       http://localhost:3001/admin.html   (password: admin123)
```
PowerShell: `$env:ADMIN_PASSWORD="admin123"; $env:SESSION_SECRET="local-dev-secret"; node server/src/index.js`

(Static-only preview without the backend: `npx serve .` — but blog/gallery/admin
won't have data.)

### Tests
```bash
npm install
npx playwright install chromium
npm test          # 119 tests; Playwright auto-starts the Node server on :3000
```

### Docker
```bash
# Static site (nginx, port 8080)
docker build -t gmvis:latest .

# API (Node, port 3001) — build from repo root
docker build -f server/Dockerfile -t gmvis-api:latest .
docker run --rm -p 3001:3001 --read-only --tmpfs /tmp -v gmvis-data:/data \
  -e ADMIN_PASSWORD=secret -e SESSION_SECRET=dev-secret gmvis-api:latest
```

### Kubernetes
```bash
cd k8s
kustomize edit set image gmvis=<registry>/gmvis:1.0.0
kustomize edit set image gmvis-api=<registry>/gmvis-api:1.0.0
cd ..
# Set ADMIN_PASSWORD/SESSION_SECRET (edit k8s/api-secret.yaml or create the secret),
# set the domain + ingressClassName in k8s/ingress.yaml, then:
kubectl apply -k k8s/
```
Both deployments run as non-root with `readOnlyRootFilesystem`, dropped
capabilities, and `seccompProfile: RuntimeDefault`. The API pod mounts a PVC at
`/data`. The ingress raises `proxy-body-size` to 200 MB for video uploads.

---

## 7. Conventions & gotchas (read before editing)

- **No templating** — the header/footer/nav are duplicated in every HTML file.
  A nav change must be applied to **all** pages (and `404.html` uses **root-relative**
  `/path` links, unlike the others which use relative `path.html`).
- **Never inject API data via `innerHTML`.** `content.js` and `admin.js` build DOM
  with `textContent`/`createElement` to avoid XSS.
- **`node:sqlite` is experimental** in Node (works fine; pinned to Node 24 in the
  image; the startup warning is suppressed in `db.js`). Swappable for
  `better-sqlite3` if a "stable" dep is required (adds a native build).
- **Web3Forms access key is a public client-side key** — safe to commit/embed.
- **Secrets**: `k8s/api-secret.yaml` ships with **placeholder** values — must be
  changed before deploying.
- **Two Docker images, one repo**: the nginx image and the API image both COPY the
  static site; keep their file lists in sync when adding pages.
- **Dev environment is Windows** (PowerShell + Git Bash). Files use **LF** endings.
- **SQLite = single writer** → the API runs as a **single replica** (`Recreate`
  strategy) on a `ReadWriteOnce` volume. Don't scale it to multiple replicas without
  changing the storage approach (e.g. Postgres + object storage).
- Tests share one DB during a run; specs assert on **data they create** (unique
  titles/captions), not on absolute counts.

---

## 8. Useful entry points when reading the code

- Accessibility toolbar / nav / read-aloud / form submit → `assets/app.js`
- Dynamic blog + gallery rendering → `assets/content.js`
- Admin portal behaviour → `assets/admin.js` (+ markup in `admin.html`)
- API routes & upload handling → `server/src/index.js`
- DB schema → `server/src/db.js`
- Auth → `server/src/auth.js`
- Design system / tokens → `assets/styles.css`
- nginx behaviour → `nginx/default.conf`
- Deployment → `Dockerfile`, `server/Dockerfile`, `k8s/`
