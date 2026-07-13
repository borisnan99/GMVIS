---
name: release-prod
description: Cut, watch, verify, or roll back a production deploy of gmvis.org (GitHub Release → Actions → ghcr.io image → ArgoCD). Use when asked to release, deploy, ship to prod, roll back, or diagnose a failed deploy. Also covers the pre-release SQLite backup.
---

# Releasing GMVIS to production

**Mental model:** pushing to `main` deploys NOTHING. Prod moves only when a
GitHub Release is published (or a manual `workflow_dispatch` with
`deploy: true`). The workflow builds `ghcr.io/borisnan99/gmvis-web` from
`server/Dockerfile`, then tells ArgoCD (`gmvis-prod` app, `prod-gmvis`
namespace) to run that exact image at the exact commit it was built from.
CI moves the tag; **ArgoCD owns the sync** — never add `argocd app sync`
to the workflow, it races the automated sync and fails.

Publishing a release is an outward-facing, hard-to-reverse action:
**confirm with the user before cutting one** unless they explicitly asked
you to release in this conversation.

## 1. Pre-release checklist (all must pass)

```bash
git status                # clean, on main, synced with origin/main
npm test                  # full Playwright suite green
helm template gmvis-prod deploy/helm/gmvis \
  --values deploy/helm/gmvis/values-prod.yaml --set image.tag=test >/dev/null
```

If `deploy/` or `server/Dockerfile` changed since the last release, also
build the image locally (`docker build -f server/Dockerfile .` from repo
root) and consider a dry run: `gh workflow run Deploy -f ref=main -f
deploy=false` builds and pushes the image without touching prod.

**If the release includes anything that touches the database schema or the
uploads layout, back up first** (the image has no sqlite3 CLI; use Node):

```bash
kubectl -n prod-gmvis exec deploy/gmvis-web -- node -e \
  "new (require('node:sqlite').DatabaseSync)('/data/gmvis.db').exec(\"VACUUM INTO '/data/backup.db'\")"
kubectl -n prod-gmvis cp $(kubectl -n prod-gmvis get pod -l app.kubernetes.io/name=gmvis -o name | cut -d/ -f2):/data/backup.db ./gmvis-backup-$(date +%Y%m%d).db
kubectl -n prod-gmvis exec deploy/gmvis-web -- rm /data/backup.db
```

## 2. Cut the release

Version: next semver after `gh release list --limit 1`. Patch for
fixes/content, minor for features, major only for breaking ops changes.

```bash
gh release create v0.X.Y --target main --generate-notes \
  --title "v0.X.Y — <one-line summary>"
```

## 3. Watch it land

```bash
gh run list --workflow=Deploy --limit 1     # grab the run id
gh run watch <run-id> --exit-status
```

What a healthy run looks like: `build-push` computes tags
(`sha-<12char>`, the release tag sanitized, `latest`), pushes to GHCR;
`deploy` logs into ArgoCD, `app create --upsert`, `app set -p
image.tag=sha-…`, `app get --refresh`, then `app wait` (up to 10 min).

Failure triage:

- **`app wait` timeout** — this is a real deployment verdict, never a
  network blip and never retried by design. Go look at the app:
  `argocd app get gmvis-prod --grpc-web` and `kubectl -n prod-gmvis get
  pods` / `describe pod`. Common causes are in
  `docs/deployment-runbook.md` → Troubleshooting (image pull auth,
  missing secrets, NFS permissions, cert issuance).
- **"another operation is already in progress"** — an earlier sync is
  still running; the workflow's retry loop normally rides it out. If it
  didn't, wait and re-dispatch. Do NOT "fix" this by adding a manual sync.
- **Transient login/RPC errors** — already retried 5× in-workflow; a
  persistent failure means the `ARGOCD_*` repo secrets or the ArgoCD
  endpoint changed.

## 4. Verify prod

```bash
curl -fsS https://gmvis.org/api/health     # {"ok":true}
```

Then browse `https://gmvis.org/`: spot-check whatever this release changed,
log into `/admin.html` if the release touched admin/API, and if the
upload/ingress path changed, upload a large video (~150–200 MB) — that is
the only check that exercises the ingress body limit, streaming timeouts,
and the Cloudflare DNS-only requirement together.

## 5. Rollback

Preferred (leaves an audit trail, rebuilds nothing by hand):

```bash
gh workflow run Deploy -f ref=<last-good-tag-or-sha> -f deploy=true
gh run watch <run-id> --exit-status
```

Faster emergency option (needs `argocd` CLI + the `gmvis-ci` credentials):
point the app straight at the previous image tag —

```bash
argocd app set gmvis-prod -p image.tag=sha-<previous-short-sha> --grpc-web
argocd app wait gmvis-prod --sync --health --operation --timeout 600 --grpc-web
```

Previous tags: `gh api /users/borisnan99/packages/container/gmvis-web/versions`
or the GHCR package page. Note the PVC (DB + uploads) is never rolled back —
only code. If bad data was written, restore from the §1 backup.

## 6. Rules that must survive any edit to the pipeline

- argocd CLI stays **pinned** (v3.4.2) — bump deliberately, smoke-test via
  `workflow_dispatch` first.
- `image.tag` has **no default** in `values.yaml`; the chart must fail to
  render without it.
- `web.replicas` must stay 1 (SQLite single writer); the chart guard
  (`fail` in `templates/deployment.yaml`) stays.
- PVC keeps `Prune=false` / `Delete=false` — an OutOfSync on only the PVC
  is the alarm working, not drift to fix.
- Secrets are SealedSecrets committed to the chart; regenerating them
  requires the cluster's public cert (`deploy/seal-secrets.sh`, runbook
  §2–3). Never commit a plaintext Secret manifest.
- Deploy concurrency group stays `cancel-in-progress: false`.
