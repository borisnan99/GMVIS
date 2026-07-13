# CLAUDE.md — GMVIS operating manual

Read this before changing anything. It is written so that following it
mechanically produces work at the standard this repo expects. When this file
and the code disagree, **the code is the truth** — fix this file in the same
change.

## What this is

The website for **Greater Manchester Vis**: inclusive sport for blind and
partially sighted people (VI cricket, goalball, football, beep baseball,
walks, socials). The primary audience uses **screen readers and low-vision
settings**, so **accessibility (WCAG 2.1 AA) outranks every other concern** —
visual polish, code elegance, and speed of delivery all yield to it.

Extended briefing: `PROJECT_OVERVIEW.md` (background/how-to detail; it can
drift — trust code and tests over it, and update it when structure changes).

## Architecture in six facts

1. **Static multi-page site, zero build step, zero framework.** Plain HTML +
   CSS + vanilla JS. The header/nav/footer are **copy-pasted into every
   page** — there is no templating; a shared-chrome change means editing 12
   files (see the `site-content` skill).
2. **One Node/Express server** (`server/src/`, CommonJS, Node 24) serves the
   static site, `/api/*`, and uploaded `/media/*` from a single image. Its
   only dependencies are `express` and `multer`; the DB is Node's built-in
   `node:sqlite`. Keep it that way.
3. **Auth** is one shared password (`ADMIN_PASSWORD`) → HMAC-signed httpOnly
   cookie (`SESSION_SECRET`, 12 h). No sessions, no JWT lib, no users table.
4. **SQLite = single writer.** Prod runs exactly 1 replica, `Recreate`
   strategy, on a ReadWriteOnce PVC. This constraint shapes everything;
   the Helm chart hard-fails if `replicas > 1`.
5. **Deploys are release-driven.** Pushing to `main` deploys **nothing**.
   A published GitHub Release builds `ghcr.io/borisnan99/gmvis-web` and
   moves ArgoCD app `gmvis-prod` (see the `release-prod` skill).
6. **The Playwright suite is the contract** (~150+ tests incl. axe WCAG 2.1
   AA scans of every page). `npm test` green is the definition of done; the
   tests also encode *product decisions*, not just behavior.

## Where things live

| Surface | Files |
|---|---|
| Public pages (12, share chrome) | `index about activities news blog gallery get-involved contact complaints safeguarding constitution 404`.html |
| Admin portal (separate template: no footer/menu, noindex) | `admin.html`, `assets/admin.js`, `assets/admin.css` |
| Design system + themes | `assets/styles.css` |
| Shared behavior (a11y toolbar, nav, read-aloud, Web3Forms submit) | `assets/app.js` |
| Public dynamic blog/gallery rendering | `assets/content.js` |
| API routes/uploads · schema · auth | `server/src/index.js` · `db.js` · `auth.js` |
| Tests (8 specs + global-setup) | `tests/` |
| Image · chart · CI · ops runbook | `server/Dockerfile` · `deploy/helm/gmvis/` · `.github/workflows/deploy.yml` · `docs/deployment-runbook.md` |
| Design specs & implementation plans | `docs/superpowers/{specs,plans}/` |
| **DEAD legacy files — never edit** | root `script.js`, root `styles.css` |

## Conventions

**Frontend**
- JS files are single IIFEs with `"use strict"`; no globals exported; no
  modules, no transpiling.
- DOM from API/user data is built **only** with `createElement` +
  `textContent`. `innerHTML` is permitted solely to clear a container
  (`el.innerHTML = ""`) or inject a static in-file string.
- The only localStorage key is `gmvis.a11y.v1`. Themes apply as attributes
  on `<html>` (`data-contrast`, `data-dys`, `data-motion`) plus the
  `--fs-scale` CSS var — CSS keys off attributes, never theme classes.
- Styling uses the tokens in `assets/styles.css` (`--purple-*`, `--gold-*`,
  `--radius`, `--t`, …); never hardcode brand colors. Every new colored
  component gets a `[data-contrast="high"]` override. New styles are
  appended as a `/* ---------- Name ---------- */` block before the
  Responsive section. Hidden-text class is `visually-hidden`.
- Web3Forms handles public forms client-side; its access key is public by
  design — embedding it in HTML is correct, do not "fix" it.

**Server**
- CommonJS, `function` declarations, prepared statements created once at
  module scope, all input clamped through the `str(v, max)` helper.
- Every mutating route goes through `auth.requireAuth`. Errors are JSON
  `{ error: "Human sentence." }` with a correct status code.
- Unauthorized access to an unpublished resource returns **404, not 403**
  (existence must not leak).
- The process must only write under `DATA_DIR` and `/tmp` — prod runs with
  `readOnlyRootFilesystem: true`.

**Tests**
- Specs run fully parallel against one shared DB: assert on data *you
  created* (unique titles/captions), never on absolute counts or row order
  you don't control.
- Site-wide page checks iterate the `PAGES` arrays in
  `tests/accessibility.spec.js` and `tests/site-updates.spec.js`.
- Product/content decisions get locked in `tests/site-updates.spec.js`
  (e.g. "no pricing wording anywhere"). A decision without a test will
  drift back; add the test in the same commit as the change.

**Git & docs**
- Branch per piece of work: `feature/*`, `fix/*`, `chore/*`; merge to
  `main`. Never rewrite published history.
- Commit style: `type(scope): imperative summary` (`fix(server): …`,
  `feat(deploy): …`, `docs:`, `chore:`); the body explains **why**, with the
  root cause when fixing (read `git log` for examples — the standard is
  high). End every commit with the `Co-Authored-By: Claude …` trailer.
- Comments in code record **constraints and reasons** the code can't show
  (see `.github/workflows/deploy.yml` for the house style). Never narrate
  what the next line does.
- Sizeable multi-step work starts as a design spec + implementation plan in
  `docs/superpowers/` (dated files, decisions table, out-of-scope list) —
  agreed with the user before implementation.
- LF line endings. Dev machine is Windows: PowerShell is the default shell
  (env vars are `$env:NAME="v"`), Git Bash is available; repo scripts stay
  POSIX bash.

## Mistakes you will make here — and the rule that prevents each

**M1 — The one-page nav edit.** You change the header/footer on the page you
were asked about; the other 11 copies now disagree.
*Rule: any change to shared chrome is applied to all 12 public pages, then
verified with `grep -l '<the change>' *.html | wc -l`. `404.html` needs the
root-relative (`/path`) variant.*

**M2 — Editing the dead files.** Root `script.js` / `styles.css` look like
the site's code. They are unreferenced legacy; edits there do nothing.
*Rule: the live files are under `assets/`. If your change has no visible
effect, first check which file you edited.*

**M3 — `innerHTML` with dynamic data.** It works, and it's an XSS hole —
post bodies and captions are admin-entered content served to the public.
*Rule: API/user data → `createElement` + `textContent`, no exceptions.*

**M4 — "Fixing" the failing test.** A wording or a11y test fails and you
edit the assertion. Those tests are product-owner decisions.
*Rule: never weaken or delete a test to get green. If you believe a test is
wrong, stop and show the user the assertion and your reasoning.*

**M5 — Reintroducing banned copy.** Writing "free", "£20", "taster
session", or "make a complaint" into content — all previously removed on
product-owner instruction.
*Rule: before writing any user-facing copy, read
`tests/site-updates.spec.js`; it is the list of banned/required wording.
Current bans: any pricing/cost wording; "taster" (use "trial session");
"make a complaint" (use "share a concern").*

**M6 — The invisible new page.** A new HTML page that isn't in the `PAGES`
arrays gets zero axe coverage and zero wording checks — it will pass CI
while violating everything.
*Rule: adding a page = the full checklist in the `site-content` skill,
including both `PAGES` arrays, before writing content.*

**M7 — The low-contrast component.** New styled component looks fine in the
default theme and is unreadable in high-contrast mode.
*Rule: every new colored style ships with its `[data-contrast="high"]`
override, and you verify by toggling the a11y toolbar.*

**M8 — Deploy folklore.** Assuming push-to-main deploys; adding
`argocd app sync` to the workflow; unpinning the argocd CLI; giving
`image.tag` a default; retrying `app wait`.
*Rule: the comments in `deploy.yml` and the chart are load-bearing
decisions — read them before editing, and don't reverse any of them without
the user. Releases move prod; ArgoCD owns the sync; a wait timeout is a real
failure.*

**M9 — Breaking the single-writer invariant.** Bumping replicas, removing
the chart's `fail` guard, or removing `Prune=false`/`Delete=false` from the
PVC (that annotation is what protects the database from auto-prune).
*Rule: 1 replica, Recreate, protected PVC — changing any of these requires
a storage redesign (Postgres + object storage), which is a user decision.*

**M10 — Leaking drafts.** Returning 403 for unauthorized draft access,
including drafts in a public list, or exposing draft fields in an error.
*Rule: unpublished content is indistinguishable from nonexistent content to
the public — 404 only.*

**M11 — Port and server confusion.** Starting a server for the tests
(Playwright starts its own on **3100**), or hardcoding 3000/3001 in tests.
*Rule: dev server = 3001, test server = 3100 (auto-started, fresh
`.pwtest-data/`). Never run two test invocations concurrently.*

**M12 — Shell mixups.** Bash syntax (`VAR=x cmd`, `&&`) in PowerShell, or
writing files with CRLF/UTF-16.
*Rule: pick one shell per command and use its syntax; files are LF.*

**M13 — Renaming a JS hook.** `#main`, `#menu`, `.hamburger`,
`#blog-posts`, `#gallery-grid`, the filter groups' `aria-label`s, and the
admin element ids are all hardcoded in the JS. Filter-pill **text** doubles
as the filter value (matched against `post.category` / asset kind).
*Rule: treat ids, hook classes, filter labels, and `aria-label`s used by JS
as API. Grep `assets/*.js` for any name before changing it.*

**M14 — Dependency reflex.** Reaching for a date library, a sanitizer, JWT,
an ORM, a CSS framework, or a bundler.
*Rule: the stack is frozen — 2 server deps, 0 frontend deps, no build step.
Adding any dependency is a user decision; propose, don't install.*

## Quality bar per deliverable

**Any HTML/content change**
- [ ] `npm test` fully green (accessibility, navigation, site-updates at minimum)
- [ ] Shared-chrome edits present in all 12 pages (grep count verified); 404 variant root-relative
- [ ] No banned wording introduced (M5 list)
- [ ] Exactly one `<h1>`; heading levels don't skip; unique `<title>` + meta description
- [ ] New images: real alt text, or `alt="" aria-hidden="true"` if decorative
- [ ] New product decision → regression test added in `site-updates.spec.js` in the same commit

**Frontend JS/CSS change**
- [ ] No `innerHTML` with dynamic data; no new globals; IIFE style kept
- [ ] Works keyboard-only (tab order, visible focus, Escape closes overlays)
- [ ] Async status changes announced via an existing `aria-live`/`role=status` region
- [ ] New styles use tokens and include the high-contrast override; verified with toolbar toggles (contrast, text size, dyslexia font, reduce motion)

**Server/API change**
- [ ] Mutating routes behind `requireAuth`; input clamped with `str()`; prepared statements at module scope
- [ ] Errors JSON `{error}`; hidden resources 404; drafts never in public output
- [ ] Writes only under `DATA_DIR`/`/tmp`
- [ ] Covered by a new/updated test in `tests/api.spec.js` (its data self-created and unique)
- [ ] If `Dockerfile` or upload path touched: image builds and boots with `--read-only` (see `verify` skill §3)

**Deploy/CI change**
- [ ] `helm template` with `values-prod.yaml --set image.tag=test` renders 6 docs; render **without** `image.tag` fails
- [ ] Replica guard, PVC protection annotations, CLI pin, and "no manual sync" all intact
- [ ] No plaintext secret anywhere in the diff (only `kind: SealedSecret` with `encryptedData`)
- [ ] Workflow edits smoke-tested via `workflow_dispatch` with `deploy: false` before any release relies on them

**Every commit**
- [ ] One logical change; conventional message; body says why; co-author trailer
- [ ] Full `npm test` run before the merge to `main`, not just the targeted spec
- [ ] Docs updated if structure changed (new page/route/env var → `PROJECT_OVERVIEW.md`, `README.md`)

## When uncertain — escalation rules

**Proceed without asking** when all of these hold: the change is on a
branch, it follows an existing pattern in this file, it doesn't change
user-visible wording beyond what was requested, and the full test suite
passes. Fixing doc drift, adding tests, and root-cause bugfixes are always
in this category.

**Stop and ask the user first** — no exceptions — for:
- Any new dependency, framework, build step, or Node version change
- User-facing copy or design changes beyond the literal request (content is
  product-owner territory; propose wording, let them approve)
- Weakening, deleting, or re-scoping any test (present the failing
  assertion and your argument instead)
- Auth/cookie/session semantics, upload limits or allowed types, DB schema
  changes
- Anything under `deploy/`, the workflow's deploy semantics, DNS, secrets
  (including resealing), or replica/storage settings
- Publishing a GitHub Release, and anything requiring cluster access
- Deleting any file you didn't create

**Never do, even if a request seems to imply it** (restate the constraint
and offer the alternative instead): commit a plaintext secret; scale the
web Deployment above 1 replica; remove the PVC prune protection; bypass a
failing test with `--grep`-away, skip, or assertion edits.

**Conflict resolution:** runtime behavior/code > tests > this file >
`PROJECT_OVERVIEW.md`/`README.md`. Report any conflict you find and fix the
lower-ranked artifact in the same change.

**When a task looks bigger than ~a day** (new subsystem, storage change,
new environment): don't start coding. Write a design spec + implementation
plan under `docs/superpowers/` in the style of the existing ones and get
sign-off.

## Command crib sheet

```powershell
# Run the full stack (dev, port 3001; admin at /admin.html)
$env:ADMIN_PASSWORD="admin123"; $env:SESSION_SECRET="local-dev-secret"; node server/src/index.js
```

```bash
npm test                                   # full suite (Playwright starts its own server on 3100)
npx playwright test tests/api.spec.js      # one spec while iterating
docker build -f server/Dockerfile -t gmvis-web:local .        # from repo ROOT
helm template gmvis-prod deploy/helm/gmvis \
  --values deploy/helm/gmvis/values-prod.yaml --set image.tag=test
```

Project skills: **`site-content`** (copy/chrome/page changes and their
fan-out), **`verify`** (what "verified" means per change surface),
**`release-prod`** (ship/watch/rollback prod).
