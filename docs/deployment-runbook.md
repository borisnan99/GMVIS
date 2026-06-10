# Deployment Runbook

Step-by-step for the one-off operator setup that takes the existing talos
cluster to a running `https://gmvis.org`. After this, the CI/CD pipeline
(GitHub Actions → ArgoCD) handles every subsequent deploy automatically.

- **Spec:** [`docs/superpowers/specs/2026-06-10-argocd-deployment-design.md`](superpowers/specs/2026-06-10-argocd-deployment-design.md)
- **Plan:** [`docs/superpowers/plans/2026-06-10-argocd-deployment.md`](superpowers/plans/2026-06-10-argocd-deployment.md)

> **Ordering matters:** commit the sealed secrets (§2–3) **before** cutting the
> first release (§5). If a release fires first, the sync succeeds but pods sit
> in `CreateContainerConfigError`/`ErrImagePull` until the secrets exist.

## 0. Pre-flight

On your machine: `kubeseal`, `kubectl`, `openssl`, `helm`.

On the cluster (all already present on the talos cluster):
`ingress-nginx`, `cert-manager` with ClusterIssuer `letsencrypt-prod`,
`sealed-secrets` controller, `nfs-client` StorageClass, ArgoCD at a public
HTTPS endpoint, and the Cloudflare integration that honours the
`cloudflare.com/dns-enabled` Ingress annotation.

> **DNS caveats:**
> 1. The Cloudflare automation only works if `gmvis.org` is a zone in the same
>    Cloudflare account the cluster integration uses. If it isn't, create the
>    A/CNAME record for `gmvis.org` → the cluster ingress IP manually after
>    the first deploy, and remove the `cloudflare.com/dns-enabled` annotation
>    from `deploy/helm/gmvis/values.yaml`.
> 2. The record must be **DNS-only (grey cloud), not proxied**. Proxied
>    records hit Cloudflare's request-body cap (100 MB on Free/Pro), which
>    hard-rejects the admin portal's 200 MB video uploads with a Cloudflare
>    413 no ingress annotation can fix, and its ~100 s origin timeout can
>    kill long video streams.

> **Storage caveats (nfs-client):**
> - `fsGroup: 1000` in the pod spec does not chown NFS volumes; writability
>   depends on the NFS export/provisioner permissions. If the pod logs show
>   `SQLITE_CANTOPEN` or `EACCES` on `/data` at first boot, fix the export's
>   anonuid/anongid or directory mode rather than the chart.
> - SQLite runs in WAL mode on an NFS-backed volume. Single replica +
>   `Recreate` strategy removes multi-writer risk, but an unclean kill can
>   still corrupt the DB — keep §8's persistence check and take periodic
>   backups (e.g. `kubectl exec ... -- sqlite3 /data/gmvis.db ".backup
>   /data/backup-$(date +%F).db"` then copy off-cluster, or adopt litestream
>   later).

## 1. ArgoCD CI account + GitHub repo secrets

```bash
# on a machine with argocd CLI + admin access
argocd account update-password \
  --account gmvis-ci \
  --new-password 'a-long-random-password'
# and grant it app:gmvis-prod permissions via your argocd-rbac-cm, e.g.:
#   p, gmvis-ci, applications, *, default/gmvis-prod, allow
```

GitHub → repo **borisnan99/GMVIS** → Settings → Secrets and variables →
Actions → add three secrets:

| Name | Value |
|---|---|
| `ARGOCD_SERVER` | ArgoCD hostname (no scheme) |
| `ARGOCD_USERNAME` | `gmvis-ci` |
| `ARGOCD_PASSWORD` | the password from above |

The repo is public, so ArgoCD pulls `https://github.com/borisnan99/GMVIS.git`
with no repository credentials.

## 2. GHCR image-pull secret

GHCR images are private by default; the cluster needs pull auth.

1. GitHub → Settings → Developer settings → Fine-grained tokens → new token.
   Resource owner: `borisnan99`. Repository access: only `GMVIS`.
   Permissions: Account → **Packages: read-only**.
2. Seal it (keep the input Secret minimal — no `metadata.annotations`, which
   kubeseal would copy through and Helm would then try to template):

```bash
cd /home/asif/dev/gmvis/GMVIS
export GHCR_USER='borisnan99'
export GHCR_PAT='<paste the PAT>'
export NAMESPACE=prod-gmvis

AUTH=$(printf '%s:%s' "$GHCR_USER" "$GHCR_PAT" | base64 -w0)
DOCKERCONFIG=$(printf '{"auths":{"ghcr.io":{"auth":"%s"}}}' "$AUTH" | base64 -w0)

cat <<EOF | deploy/seal-secrets.sh \
  > deploy/helm/gmvis/templates/sealed-secrets/prod/ghcr-pull-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: ghcr-pull
  namespace: $NAMESPACE
type: kubernetes.io/dockerconfigjson
data:
  .dockerconfigjson: $DOCKERCONFIG
EOF

unset GHCR_USER GHCR_PAT AUTH DOCKERCONFIG
```

Verify: the file starts `kind: SealedSecret` with an `encryptedData` block and
carries the `argocd.argoproj.io/sync-wave: "-20"` annotation.

## 3. App secret (admin password + session secret)

```bash
cd /home/asif/dev/gmvis/GMVIS
export NAMESPACE=prod-gmvis

# Choose the real admin portal password; generate the session secret.
export ADMIN_PASSWORD='<choose-a-strong-password>'
export SESSION_SECRET=$(openssl rand -hex 32)

cat <<EOF | deploy/seal-secrets.sh \
  > deploy/helm/gmvis/templates/sealed-secrets/prod/app-secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: gmvis-app
  namespace: $NAMESPACE
type: Opaque
stringData:
  ADMIN_PASSWORD: "$ADMIN_PASSWORD"
  SESSION_SECRET: "$SESSION_SECRET"
EOF

unset ADMIN_PASSWORD SESSION_SECRET
```

## 4. Verify the chart renders, commit, push

```bash
helm template gmvis-prod deploy/helm/gmvis \
  --values deploy/helm/gmvis/values-prod.yaml \
  --set image.tag=test > /tmp/rendered.yaml
grep -c '^kind:' /tmp/rendered.yaml   # expect 6: Deployment, Service, PVC, Ingress, 2× SealedSecret

git add deploy/helm/gmvis/templates/sealed-secrets/prod/
git commit -m "chore: bootstrap production sealed secrets"
git push origin main
```

## 5. Cut the first release

GitHub → Releases → Draft a new release → tag `v0.1.0` on `main` → Publish.

The Deploy workflow then: builds + pushes
`ghcr.io/borisnan99/gmvis-web:sha-<short>` (+ `v0.1.0`, `latest`) →
`argocd login` → `argocd app create gmvis-prod --upsert … --sync-policy
automated --auto-prune --self-heal --revision <built-commit-SHA>` →
`argocd app set -p image.tag=sha-<short>` → `argocd app get --refresh` →
`argocd app wait` (10-min timeout, not retried — a wait timeout is a real
deploy failure).

The revision is pinned to the exact commit the image was built from, so the
app never auto-tracks a branch: pushes to `main` do **not** deploy; only
releases (or a manual `workflow_dispatch` with `deploy: true`) move prod.

> **No explicit `argocd app sync`.** With auto-sync on, the `app set` already
> triggers a sync; a manual sync races it and fails with "another operation is
> already in progress". CI moves the tag; ArgoCD owns the sync.

Expected first-deploy sequence in the cluster: namespace `prod-gmvis` created
→ SealedSecrets decrypt to `gmvis-app` + `ghcr-pull` (sync-wave -20) → PVC
binds (nfs-client) → Deployment rolls and passes `/api/health` probes →
Ingress provisioned, cert-manager issues `gmvis-web-tls`, DNS record appears.

## 6. Smoke test

```bash
curl -fsS https://gmvis.org/api/health        # {"ok":true}
```

Then in a browser: load `https://gmvis.org/`, log in at `/admin.html` with
the admin password, create a test post, upload a test image, **and upload one
large test video (~150–200 MB)** — the video is the only test that exercises
the ingress body-size limit, the streaming timeouts, and the Cloudflare path
together. Confirm both appear on `/blog.html` and `/gallery.html` and the
video seeks (range requests). Finally verify persistence:

```bash
kubectl -n prod-gmvis rollout restart deploy/gmvis-web
kubectl -n prod-gmvis rollout status deploy/gmvis-web
# reload /blog.html — the test post and media must still be there
```

Delete the test post/media via `/admin.html` when done.

## Troubleshooting

- **Image pull errors:** the GHCR PAT in `ghcr-pull` lacks Packages:read, or
  the package `gmvis-web` is under a different owner. Regenerate + reseal (§2).
- **SealedSecret won't decrypt:** it was sealed for the wrong namespace or
  with the wrong cert (`--scope strict` binds name + namespace). Reseal with
  `SEALED_SECRETS_NAMESPACE=prod-gmvis`.
- **Pods in `CreateContainerConfigError`:** the `gmvis-app` secret is missing —
  §3 wasn't committed/pushed before the deploy. Commit it; ArgoCD picks it up
  on the next poll (~3 min) or after `argocd app get gmvis-prod --refresh`.
- **`SQLITE_CANTOPEN` / permission denied on /data:** NFS export permissions —
  see the storage caveat in §0.
- **Cert never issues:** check `kubectl -n prod-gmvis describe certificate
  gmvis-web-tls`; usually DNS hasn't propagated (see §0 DNS caveats).
- **Uploads fail with an HTML 413 or Cloudflare error page:** the DNS record
  is proxied (orange cloud) — switch it to DNS-only (§0), or the file exceeds
  multer's 200 MB limit (expected, the app returns a JSON error for that).
- **App shows OutOfSync on the PVC only:** someone removed the PVC from the
  chart — it is annotated `Prune=false,Delete=false` precisely so ArgoCD
  retains it; that OutOfSync is the alarm working. Restore the template or
  migrate the data deliberately.
- **"another operation is already in progress" in CI:** a previous sync is
  still running; the retry loop normally rides this out. Never add a manual
  `argocd app sync` to the workflow.
- **Temporary manual override during an incident:**
  `argocd app set gmvis-prod --sync-policy none --grpc-web`, do the work, then
  re-enable with `--sync-policy automated --auto-prune --self-heal`. The next
  CI run re-asserts automated sync anyway.
