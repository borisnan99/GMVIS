---
name: verify
description: Verify a GMVIS change end-to-end — run the right slice of the Playwright suite, drive the real stack (site + admin portal), and do the render/build checks for server or deploy changes. Use before committing any nontrivial change, or when asked to run/check/verify the app.
---

# Verifying a GMVIS change

The suite is the contract: **every test green is the definition of done** for
this repo. Tests encode product decisions (accessibility, content wording,
draft privacy), so a red test usually means *your change is wrong*, not the
test. Never weaken an assertion to get green without explicit user sign-off.

## One-time setup (per machine)

```bash
npm install                      # repo root — Playwright tooling
cd server && npm install && cd ..  # backend deps (express, multer)
npx playwright install chromium
```

No other setup: the DB is Node's built-in `node:sqlite` (no native deps),
and there is **no build step** anywhere.

## 1. Run the test suite

```bash
npm test                                  # full suite (~150+ tests, chromium)
npx playwright test tests/api.spec.js     # one spec
npx playwright test --grep "draft"        # by title
npm run test:report                       # open HTML report after a run
```

Facts you need to interpret results correctly:

- Playwright **auto-starts the server** on port **3100** with a fresh
  `.pwtest-data/` dir (`playwright.config.js` + `tests/global-setup.js`).
  Don't start a server yourself for tests; don't run two test runs at once
  (`reuseExistingServer: false` will fail the second).
- Tests run **fully parallel against one shared DB**. Specs assert on data
  they themselves created (unique titles/captions) — never on absolute
  counts. Follow that pattern in any test you add.
- Admin password inside tests is `test-admin-pass` (set in
  `playwright.config.js`).
- On failure: screenshots land in `test-results/`; read the axe report text
  embedded in accessibility failures — it names the violating selector.
- A stale-lock warning from global-setup about `.pwtest-data` is tolerated
  by design; it is not the cause of your failure.

### Which specs cover what

| You changed | Must-run specs |
|---|---|
| Any HTML page / copy | `accessibility`, `navigation`, `site-updates` |
| `assets/app.js` (toolbar, nav, read-aloud, forms) | `functionality`, `forms`, `accessibility` |
| `assets/content.js` (public blog/gallery) | `public-content` |
| `assets/admin.js` / `admin.html` | `admin` |
| `server/src/*` | `api`, `admin`, `public-content` |
| New page added | ALL — and the page must be added to the `PAGES` arrays in `tests/accessibility.spec.js` and `tests/site-updates.spec.js` first |

Run the full suite before committing anyway; targeted runs are for iterating.

## 2. Drive the real stack (don't stop at tests)

```powershell
# PowerShell (the usual dev shell on this machine)
$env:ADMIN_PASSWORD="admin123"; $env:SESSION_SECRET="local-dev-secret"; node server/src/index.js
```

```bash
# Git Bash
ADMIN_PASSWORD=admin123 SESSION_SECRET=local-dev-secret node server/src/index.js
```

One process serves everything at **http://localhost:3001** (static site +
`/api` + `/media`). Port 3001 is dev; 3100 is tests — never hardcode 3000.

Smoke flow after a functional change (use browser automation or curl):

1. `GET /api/health` → `{"ok":true}`.
2. Load `/` — check the a11y toolbar button and skip link exist.
3. Log in at `/admin.html` (password from the env var above).
4. Create a post with a unique title; upload a small image with a caption.
5. Load `/blog.html` and `/gallery.html` — both items appear (rendered by
   `assets/content.js` at runtime).
6. Unpublish the post → it disappears from `/blog.html`, and
   `GET /api/posts/:id` without the cookie returns **404** (drafts must not
   leak existence).
7. Clean up the test post/media via the admin UI.

For accessibility-affecting changes, additionally verify by hand what axe
can't: tab through the new UI (focus visible, order sensible), and toggle
the toolbar settings (text size, high contrast, dyslexia font, reduce
motion) to confirm the new elements respect them.

## 3. Extra checks by change surface

**Server / Dockerfile changed** — build and boot the production image:

```bash
docker build -f server/Dockerfile -t gmvis-web:local .   # from repo ROOT, not server/
docker run --rm -p 3001:3001 --read-only --tmpfs /tmp -v gmvis-data:/data \
  -e ADMIN_PASSWORD=secret -e SESSION_SECRET=dev-secret gmvis-web:local
```

Keep `--read-only`: the prod pod runs with `readOnlyRootFilesystem: true`,
so a change that needs to write outside `/data` or `/tmp` will pass locally
without it and then crash in prod.

**`deploy/helm/gmvis/` changed** — both renders, in this order:

```bash
# 1. must FAIL (image.tag is required by design — deploys can't ship a floating tag):
helm template gmvis-prod deploy/helm/gmvis --values deploy/helm/gmvis/values-prod.yaml
# 2. must succeed and emit 6 'kind:' docs (Deployment, Service, PVC, Ingress, 2× SealedSecret):
helm template gmvis-prod deploy/helm/gmvis \
  --values deploy/helm/gmvis/values-prod.yaml --set image.tag=test | grep -c '^kind:'
```

Also confirm the invariants survived your edit: `replicas` guard
(`fail "web.replicas must be 1"`) in `templates/deployment.yaml`, and
`Prune=false` + `Delete=false` annotations on `templates/pvc.yaml`.

**`.github/workflows/deploy.yml` changed** — there is no offline test;
validate with `gh workflow view Deploy`, re-read the inline comments (they
encode hard-won semantics: no manual `argocd app sync`, pinned CLI, wait is
never retried), and smoke-test via a `workflow_dispatch` with
`deploy: false` before trusting it on a release.

## 4. Report

State what you ran and the result plainly: test counts (passed/failed/
skipped), which smoke steps you performed, and anything you could NOT
verify (e.g. no cluster access, no Docker daemon) — flagged as unverified,
not silently skipped.
