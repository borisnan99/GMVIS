---
name: site-content
description: Make content, copy, nav/footer, or page-structure changes across the GMVIS static site — including product-owner revision batches and adding a whole new page. Use for any edit to the root *.html files or site copy. Encodes the no-templating fan-out (a chrome change = 12 files), the wording invariants, and the regression-test requirement.
---

# Editing GMVIS site content

There is **no templating and no build step**: the header, nav, and footer
are copy-pasted into every HTML file. Any shared-chrome change must be
applied to every page by hand, and every content decision gets locked in
with a regression test so it can't silently drift back.

## The page inventory (know your fan-out)

12 public pages share the chrome: `index`, `about`, `activities`, `news`,
`blog`, `gallery`, `get-involved`, `contact`, `complaints`, `safeguarding`,
`constitution`, `404` (all `.html`, repo root). Two special cases:

- **`404.html` uses root-relative paths** (`/assets/styles.css`,
  `/index.html`) so it renders from any unmatched nested URL. When
  propagating a chrome change to it, convert the hrefs. Never "fix" it
  back to relative paths.
- **`admin.html` is a separate template**: different nav
  (`aria-label="Admin"`), no primary menu, no footer, `robots noindex`,
  loads `assets/admin.css`. Chrome changes usually don't apply to it.

Fan-out cheat sheet:

| Change | Files to edit |
|---|---|
| Header nav menu (8 links + "Join in" CTA) | 12 files |
| Footer (Explore / Get involved / Contact columns, partners strip, policies row) | 12 files |
| Head boilerplate (fonts, meta) | 13 files (incl. admin) |
| Copy on one page | that page — then grep, the same phrase often exists on `index.html` teasers and in the footer |

After any fan-out edit, verify mechanically — count must equal the
expected file count, and 404's variant must be checked separately:

```bash
grep -l 'the-new-nav-label' *.html | wc -l
grep -n 'href="/' 404.html | head    # 404 stayed root-relative
```

## Wording invariants (tests enforce these — do not reintroduce)

`tests/site-updates.spec.js` codifies product-owner decisions. Before
writing copy, read it. Currently enforced, site-wide:

- **No pricing or cost wording anywhere**: no `£`, no "free taster", no
  "affordable", no "kit to buy". Don't mention money at all.
- "**trial session**", not "taster" (CTA style: "Book your trial session
  now").
- "**Share a concern**", not "Make a complaint".
- Every page keeps the floating "Listen to this page" control and content
  pages keep their hero "Listen" (`[data-readaloud]`) button.

House style from the existing copy: British English (en-GB), warm and
direct, second person, sport-specific but inclusive ("blind and partially
sighted", "with or without sight"). The audience is screen-reader users
first — front-load meaning in link text (never "click here").

**When the product owner changes a decision** (new wording rule, removed
concept, renamed CTA): apply it everywhere, then **add or update a
regression test in `tests/site-updates.spec.js`** in the same commit, in
the existing style — loop over `PUBLIC_PAGES`, assert the old wording is
absent / the new element exists. A content decision without a test will
drift back.

## Markup patterns to copy exactly (accessibility is the product)

Copy the pattern from an existing page; don't invent variants:

- **One `<h1>` per page** (visible `.display` in the hero on inner pages;
  `index.html` has a visually-hidden one). Sections are
  `<section aria-labelledby="…">` → `<h2 class="h2" id="…">`; cards `<h3>`;
  footer columns `<h4>`. Never skip levels; never use h5/h6 (unstyled).
- **Hidden text class is `visually-hidden`** (not `sr-only`).
- **Decorative image/SVG**: `alt=""` + `aria-hidden="true"`. Meaningful
  image: real alt text. Placeholder chips:
  `<div class="ph" aria-hidden="true" data-label="…">`.
- **Dated events** (see `news.html:54`): `<time datetime="YYYY-MM-DD">`
  containing a `visually-hidden` full date plus `aria-hidden` day/month
  display spans.
- **External links**: `target="_blank" rel="noopener noreferrer"` and an
  `aria-label` ending "(opens in a new tab)".
- **New colored component in `assets/styles.css`** → must also get a
  `[data-contrast="high"]` override (the file is full of them — this is
  the most-repeated pattern). Append new styles as a new
  `/* ---------- Name ---------- */` block near the end, before the
  `Responsive` media queries. Use the existing tokens (`--purple-600`,
  `--gold-*`, `--radius`, `--t`); never hardcode brand colors.
- **Forms**: label `for` every input, `aria-required`, error span
  `role="alert"` wired via `aria-describedby`, honeypot `botcheck` input,
  success/error blocks with `role="status"`/`role="alert"`. Web3Forms
  access key is public by design — safe in HTML, don't try to hide it.
- Filter-pill labels on `blog.html`/`gallery.html` are **string-coupled to
  data**: `content.js` matches `button.textContent` against `p.category` /
  asset kind. Renaming a pill = breaking the filter unless the categories
  change too.

## Adding a new page — full checklist

1. Copy the nearest existing page (e.g. `safeguarding.html`) wholesale;
   keep the head block, skip link, header, footer, and `assets/app.js`
   script tag intact.
2. Unique `<title>` and `<meta name="description">`; exactly one `<h1>`.
3. Hero read-aloud block: `.readaloud` button with
   `data-readaloud="#xxx-read"` + the matching
   `<p id="xxx-read" class="visually-hidden" data-read-text="…">`.
4. Decide navigation: primary menu (edit the menu in **all 12 pages**,
   and give the new page's own menu entry `aria-current="page"`) or
   footer-only (like safeguarding/constitution — no `aria-current`
   anywhere).
5. Add the page to **both** `PAGES` arrays: `tests/accessibility.spec.js`
   and `tests/site-updates.spec.js` (`PUBLIC_PAGES`).
6. Nothing to do for the Docker image — `server/Dockerfile` globs
   `COPY *.html /site/`. Do not switch that back to a file list.
7. Run the full suite: `npm test` (axe scans the new page automatically
   once it's in `PAGES`).

## Traps

- **Root `script.js` and root `styles.css` are dead legacy files** — no
  page references them. The live files are `assets/app.js` and
  `assets/styles.css`. Never edit the root ones; if a change seems to have
  no effect, check which file you edited.
- `formatDate` exists twice (`assets/content.js` and `assets/admin.js`) —
  change both or neither.
- The `#menu` id, `.hamburger` class, and `#main` id are JS hooks
  (`app.js`); the blog/gallery containers `#blog-posts`/`#gallery-grid`
  and the filter groups' `aria-label`s are `content.js` hooks. Renaming
  any of these breaks behavior silently.
- Icon SVGs inside `.ic` and `li > svg` get `aria-hidden` applied at
  runtime by `app.js` — don't rely on that sweep for SVGs elsewhere; set
  `aria-hidden="true"` in markup.

## Done means

`npm test` fully green (accessibility + navigation + site-updates at
minimum), the fan-out grep counts match, new content decisions have a
regression test, and the commit message body records *why* the content
changed (e.g. "product-owner revision: …").
