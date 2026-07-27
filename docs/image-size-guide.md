# Image size guide — gmvis.org

Recommended upload sizes per page (width × height, pixels). Measured from
the live templates at desktop width; recommendations are 2× the rendered
size so photos stay crisp on high-density screens. Last updated 28.07.26 —
re-measure if card/hero layouts change.

**Golden rules**

- Bigger than recommended is fine (browsers scale down); below the minimum
  looks soft.
- Every slot crops centre-weighted to fill its box (`object-fit: cover`) —
  keep subjects near the middle and match the aspect ratio.
- JPG for photos (~quality 80, ideally < 500 KB); PNG with transparency for
  logos. Every image needs a one-line description (alt text).

## Home

| Slot | Count | Recommended | Minimum | Shape |
|---|---|---|---|---|
| "Who we are" photo | 1 | 1200 × 800 | 620 × 410 | 3:2 landscape |
| Activity cards | 6 | 800 × 450 | 400 × 225 | 16:9 landscape |
| News teaser cards | 3 | 800 × 450 | 400 × 225 | 16:9 landscape |

## About

| Slot | Count | Recommended | Minimum | Shape |
|---|---|---|---|---|
| "Our story" photo | 1 | 1200 × 800 | 620 × 410 | 3:2 landscape |
| Meet-the-teams cards | 3 | 900 × 600 | 400 × 270 | 3:2 landscape |
| Falcons lockup | — | fixed SVG brand asset | | |

## Activities

| Slot | Count | Recommended | Minimum | Shape |
|---|---|---|---|---|
| Per-sport photo | 6 | 1200 × 800 | 620 × 400 | 3:2 landscape |

## News list

| Slot | Count | Recommended | Minimum | Shape |
|---|---|---|---|---|
| Story cards | 6 | 800 × 450 | 400 × 225 | 16:9 landscape |

## News detail (news-article.html)

| Slot | Count | Recommended | Minimum | Shape |
|---|---|---|---|---|
| Main article photo | 1/story | 1600 × 900 | 760 × 430 | 16:9 landscape |
| Related-story cards | — | reuse of news card images | | |

## Blog

| Slot | Count | Recommended | Minimum | Shape |
|---|---|---|---|---|
| Post cover (via admin) | 1/post | 800 × 450 | 400 × 225 | 16:9 landscape |

## Gallery

| Slot | Count | Recommended | Minimum | Shape |
|---|---|---|---|---|
| Photos (via admin) | any | 1600 longest side | 800 | any |
| Videos (via admin) | any | MP4, ≤ ~200 MB | | |

## Get involved

| Slot | Count | Recommended | Minimum | Shape |
|---|---|---|---|---|
| Sponsor logos | 4 | 500 × 200 | 250 × 100 | PNG, transparent |

## Who uploads what

- **Self-serve via `/admin.html`** (admin password, 12 h session): gallery
  photos/videos, blog posts incl. cover images.
- **Via a code change** (baked into the static pages): home/about/activities
  photos, news story images, sponsor logos.
