# GMVIS ArgoCD Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy GMVIS to the talos Kubernetes cluster via ArgoCD with release-driven CI/CD, mirroring the bcewhub-app pattern.

**Architecture:** A single-image Helm chart (`deploy/helm/gmvis/`) — the Node/Express image already serves the static site, `/api`, and `/media`. SealedSecrets are committed to the chart. A GitHub Actions workflow builds `ghcr.io/borisnan99/gmvis-web` and drives ArgoCD (`app create --upsert` → `app set image.tag` → `app wait`; ArgoCD owns the sync). The old `k8s/` Kustomize manifests, root nginx `Dockerfile`, and `nginx/` directory are deleted.

**Tech Stack:** Helm 3, ArgoCD CLI v3.4.2, sealed-secrets (kubeseal), GitHub Actions, GHCR, Docker.

**Spec:** `docs/superpowers/specs/2026-06-10-argocd-deployment-design.md`

**Prerequisites for the implementing engineer:** `helm` and `kubectl` CLIs on PATH (no cluster access needed — all verification is offline). `kubeseal` is NOT needed (sealing happens later, by the operator, per the runbook).

**Conventions:** Run all commands from the repo root `/home/asif/dev/gmvis/GMVIS`. Every commit message ends with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.

---

### Task 1: Helm chart scaffolding (Chart.yaml, values, helpers)

**Files:**
- Create: `deploy/helm/gmvis/Chart.yaml`
- Create: `deploy/helm/gmvis/values.yaml`
- Create: `deploy/helm/gmvis/values-prod.yaml`
- Create: `deploy/helm/gmvis/templates/_helpers.tpl`

- [ ] **Step 1: Create `deploy/helm/gmvis/Chart.yaml`**

```yaml
apiVersion: v2
name: gmvis
description: Greater Manchester Vis — accessible community site + admin API (single image)
type: application
version: 0.1.0
appVersion: "1.0.0"
```

- [ ] **Step 2: Create `deploy/helm/gmvis/values.yaml`**

```yaml
# Default values. Production overrides live in values-prod.yaml.

image:
  repository: ghcr.io/borisnan99/gmvis-web
  # REQUIRED — no default on purpose. CI sets it at deploy time via
  # `argocd app set -p image.tag=sha-<short>`; local renders must pass
  # `--set image.tag=<something>`. The chart fails to render without it
  # so a deploy can never silently ship a stale or floating tag.
  tag: ""
  pullPolicy: IfNotPresent
  pullSecretName: ghcr-pull

namespace: prod-gmvis

web:
  replicas: 1
  port: 3001
  resources:
    requests: { cpu: 25m, memory: 64Mi }
    limits:   { cpu: 500m, memory: 256Mi }

# SQLite DB + admin uploads live here. ReadWriteOnce, single writer.
storage:
  size: 5Gi
  storageClassName: nfs-client

ingress:
  host: gmvis.org
  tlsSecretName: gmvis-web-tls
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    cloudflare.com/dns-enabled: "true"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    # Admin video uploads go up to 200 MB (multer limit in server/src/index.js).
    nginx.ingress.kubernetes.io/proxy-body-size: "200m"

# Non-secret env for the web container. ADMIN_PASSWORD and SESSION_SECRET
# come from the `gmvis-app` SealedSecret.
config:
  NODE_ENV: production
  COOKIE_SECURE: "true"   # cookies require HTTPS; TLS terminates at the ingress
```

- [ ] **Step 3: Create `deploy/helm/gmvis/values-prod.yaml`**

```yaml
# Prod overrides. Defaults in values.yaml are already prod-shaped; this file
# exists so environment-specific values have an explicit home (and so the CI
# `--values values-prod.yaml` flag matches the bcewhub pattern). Add a
# values-staging.yaml alongside if a staging environment appears later.

ingress:
  host: gmvis.org
```

- [ ] **Step 4: Create `deploy/helm/gmvis/templates/_helpers.tpl`**

```yaml
{{/* Standard labels applied to every resource. */}}
{{- define "gmvis.labels" -}}
app.kubernetes.io/name: gmvis
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: gmvis
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{/* Selector labels for the web workload (immutable once deployed). */}}
{{- define "gmvis.selectorLabels" -}}
app.kubernetes.io/name: gmvis
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: web
{{- end -}}

{{/* Full image reference. Fails fast if image.tag was not provided. */}}
{{- define "gmvis.image" -}}
{{- $repo := required "image.repository must be set" .Values.image.repository -}}
{{- $tag := required "image.tag must be set — CI passes it via `argocd app set -p image.tag=sha-…`; for local renders add `--set image.tag=test`" .Values.image.tag -}}
{{ $repo }}:{{ $tag }}
{{- end -}}
```

- [ ] **Step 5: Verify the empty chart renders**

Run: `helm template gmvis-prod deploy/helm/gmvis --values deploy/helm/gmvis/values-prod.yaml --set image.tag=test`
Expected: exits 0 with empty output (no resource templates yet, no errors).

- [ ] **Step 6: Commit**

```bash
git add deploy/helm/gmvis
git commit -m "feat(deploy): scaffold gmvis Helm chart (Chart.yaml, values, helpers)"
```

---

### Task 2: Deployment template

**Files:**
- Create: `deploy/helm/gmvis/templates/deployment.yaml`

This is a port of the old `k8s/api-deployment.yaml` (same probes, security
context, and env), renamed to the single-image `gmvis-web` identity, with
image/resources/config sourced from values and the secret renamed
`gmvis-api-secret` → `gmvis-app`.

- [ ] **Step 1: Confirm the fail-fast contract before the template exists**

Run: `helm template gmvis-prod deploy/helm/gmvis --values deploy/helm/gmvis/values-prod.yaml`
Expected: exits 0 (nothing references `image.tag` yet). This step documents the baseline; the real assertion comes in Step 4 after the template exists.

- [ ] **Step 2: Create `deploy/helm/gmvis/templates/deployment.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gmvis-web
  labels:
    {{- include "gmvis.labels" . | nindent 4 }}
    app.kubernetes.io/component: web
spec:
  # Single replica: the SQLite DB + uploads live on a ReadWriteOnce volume and
  # SQLite expects a single writer. Recreate avoids two pods sharing the volume.
  replicas: {{ .Values.web.replicas }}
  strategy:
    type: Recreate
  selector:
    matchLabels:
      {{- include "gmvis.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "gmvis.selectorLabels" . | nindent 8 }}
        app.kubernetes.io/part-of: gmvis
    spec:
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000            # so the mounted volume is writable by the node user
        seccompProfile:
          type: RuntimeDefault
      imagePullSecrets:
        - name: {{ .Values.image.pullSecretName }}
      containers:
        - name: web
          image: {{ include "gmvis.image" . }}
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.web.port }}
          env:
            - name: PORT
              value: {{ .Values.web.port | quote }}
            - name: DATA_DIR
              value: /data
            - name: SITE_DIR
              value: /site
            {{- range $k, $v := .Values.config }}
            - name: {{ $k }}
              value: {{ $v | quote }}
            {{- end }}
            - name: ADMIN_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: gmvis-app
                  key: ADMIN_PASSWORD
            - name: SESSION_SECRET
              valueFrom:
                secretKeyRef:
                  name: gmvis-app
                  key: SESSION_SECRET
          readinessProbe:
            httpGet: { path: /api/health, port: http }
            initialDelaySeconds: 3
            periodSeconds: 10
            timeoutSeconds: 3
          livenessProbe:
            httpGet: { path: /api/health, port: http }
            initialDelaySeconds: 5
            periodSeconds: 15
            timeoutSeconds: 3
            failureThreshold: 3
          resources:
            {{- toYaml .Values.web.resources | nindent 12 }}
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: ["ALL"]
          volumeMounts:
            - name: data
              mountPath: /data
            - name: tmp
              mountPath: /tmp
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: gmvis-api-data
        - name: tmp
          emptyDir: {}
```

- [ ] **Step 3: Verify the render contains the ported fields**

Run: `helm template gmvis-prod deploy/helm/gmvis --values deploy/helm/gmvis/values-prod.yaml --set image.tag=sha-abc123 | grep -E "kind: Deployment|image: |type: Recreate|claimName:|ghcr-pull|gmvis-app"`
Expected output includes all of:
```
kind: Deployment
  type: Recreate
        - name: ghcr-pull
          image: ghcr.io/borisnan99/gmvis-web:sha-abc123
                  name: gmvis-app
            claimName: gmvis-api-data
```

- [ ] **Step 4: Verify the missing-tag fail-fast**

Run: `helm template gmvis-prod deploy/helm/gmvis --values deploy/helm/gmvis/values-prod.yaml`
Expected: FAILS (non-zero exit) with error containing `image.tag must be set`.

- [ ] **Step 5: Commit**

```bash
git add deploy/helm/gmvis/templates/deployment.yaml
git commit -m "feat(deploy): web Deployment template (single image, Recreate, hardened)"
```

---

### Task 3: Service and PVC templates

**Files:**
- Create: `deploy/helm/gmvis/templates/service.yaml`
- Create: `deploy/helm/gmvis/templates/pvc.yaml`

- [ ] **Step 1: Create `deploy/helm/gmvis/templates/service.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: gmvis-web
  labels:
    {{- include "gmvis.labels" . | nindent 4 }}
    app.kubernetes.io/component: web
spec:
  type: ClusterIP
  selector:
    {{- include "gmvis.selectorLabels" . | nindent 4 }}
  ports:
    - name: http
      port: {{ .Values.web.port }}
      targetPort: http
```

- [ ] **Step 2: Create `deploy/helm/gmvis/templates/pvc.yaml`**

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: gmvis-api-data
  labels:
    {{- include "gmvis.labels" . | nindent 4 }}
    app.kubernetes.io/component: web
  annotations:
    # This volume holds the SQLite database and every admin upload.
    # Never let an ArgoCD auto-prune delete it, even if the PVC is
    # removed from the chart by mistake.
    argocd.argoproj.io/sync-options: Prune=false
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: {{ .Values.storage.storageClassName }}
  resources:
    requests:
      storage: {{ .Values.storage.size }}
```

- [ ] **Step 3: Verify the render**

Run: `helm template gmvis-prod deploy/helm/gmvis --values deploy/helm/gmvis/values-prod.yaml --set image.tag=test | grep -E "kind: (Service|PersistentVolumeClaim)|Prune=false|nfs-client|storage: 5Gi"`
Expected output includes all of:
```
kind: Service
kind: PersistentVolumeClaim
    argocd.argoproj.io/sync-options: Prune=false
  storageClassName: nfs-client
      storage: 5Gi
```

- [ ] **Step 4: Commit**

```bash
git add deploy/helm/gmvis/templates/service.yaml deploy/helm/gmvis/templates/pvc.yaml
git commit -m "feat(deploy): Service + prune-protected PVC templates"
```

---

### Task 4: Ingress template + full offline validation

**Files:**
- Create: `deploy/helm/gmvis/templates/ingress.yaml`

- [ ] **Step 1: Create `deploy/helm/gmvis/templates/ingress.yaml`**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: gmvis-web
  labels:
    {{- include "gmvis.labels" . | nindent 4 }}
    app.kubernetes.io/component: web
  annotations:
    {{- range $k, $v := .Values.ingress.annotations }}
    {{ $k }}: {{ $v | quote }}
    {{- end }}
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - {{ .Values.ingress.host }}
      secretName: {{ .Values.ingress.tlsSecretName }}
  rules:
    - host: {{ .Values.ingress.host }}
      http:
        paths:
          # Single backend: the app serves the static site, /api and /media.
          - path: /
            pathType: Prefix
            backend:
              service:
                name: gmvis-web
                port:
                  name: http
```

- [ ] **Step 2: Verify the render**

Run: `helm template gmvis-prod deploy/helm/gmvis --values deploy/helm/gmvis/values-prod.yaml --set image.tag=test | grep -E "kind: Ingress|host: |letsencrypt-prod|dns-enabled|proxy-body-size"`
Expected output includes all of:
```
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    cloudflare.com/dns-enabled: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "200m"
kind: Ingress
    - host: gmvis.org
```
(plus the `tls:` host line)

- [ ] **Step 3: Validate the whole chart against Kubernetes client schemas**

Run: `helm template gmvis-prod deploy/helm/gmvis --values deploy/helm/gmvis/values-prod.yaml --set image.tag=test | kubectl apply --dry-run=client -f -`
Expected: four lines, each ending `created (dry run)` — Deployment, Service, PersistentVolumeClaim, Ingress. No warnings or errors. (`--dry-run=client` validates offline; no cluster connection is made for schema errors, but if kubectl complains about no current context, use `kubectl apply --dry-run=client --validate=false -f -` and instead eyeball the four `kind:` blocks.)

- [ ] **Step 4: Commit**

```bash
git add deploy/helm/gmvis/templates/ingress.yaml
git commit -m "feat(deploy): Ingress with cert-manager TLS, Cloudflare DNS, 200m upload limit"
```

---

### Task 5: seal-secrets.sh helper and sealed-secrets directory

**Files:**
- Create: `deploy/seal-secrets.sh` (mode 755)
- Create: `deploy/helm/gmvis/templates/sealed-secrets/prod/_README.md`

The actual SealedSecret YAML files are generated by the operator during
bootstrap (runbook §2–3) because they require the real admin password and a
GHCR PAT. The chart must render fine while the directory holds no manifests.

- [ ] **Step 1: Create `deploy/seal-secrets.sh`**

```bash
#!/usr/bin/env bash
# deploy/seal-secrets.sh
#
# Wrap kubeseal with the cluster's public cert + the prod-gmvis namespace.
# Usage:
#   cat plain-secret.yaml | deploy/seal-secrets.sh > deploy/helm/gmvis/templates/sealed-secrets/prod/app-secrets.yaml
#
# The plain YAML on stdin must be a regular Kubernetes Secret manifest.
# kubeseal is available from https://github.com/bitnami-labs/sealed-secrets/releases

set -euo pipefail

CERT_PATH="${SEALED_SECRETS_CERT:-/home/asif/dev/cititech/talos-cluster/terraform/k8s-base/sealed-secrets/pub-cert.pem}"
NAMESPACE="${SEALED_SECRETS_NAMESPACE:-prod-gmvis}"

if [[ ! -f "$CERT_PATH" ]]; then
  echo "error: sealed-secrets public cert not found at $CERT_PATH" >&2
  echo "override with SEALED_SECRETS_CERT=/path/to/pub-cert.pem" >&2
  exit 1
fi

if ! command -v kubeseal >/dev/null 2>&1; then
  echo "error: kubeseal not found on PATH" >&2
  echo "install from https://github.com/bitnami-labs/sealed-secrets/releases" >&2
  exit 1
fi

# After kubeseal emits the SealedSecret, inject an ArgoCD sync-wave
# annotation so the resource is applied (and the sealed-secrets controller
# has time to decrypt it into a real Secret) before the Deployment that
# reads it starts. The workload lives at wave 0, so -20 is safely ahead.

kubeseal \
  --cert "$CERT_PATH" \
  --format yaml \
  --namespace "$NAMESPACE" \
  --scope strict \
| awk '
    !injected && /^metadata:$/ {
      print
      print "  annotations:"
      print "    argocd.argoproj.io/sync-wave: \"-20\""
      injected = 1
      next
    }
    { print }
  '
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x deploy/seal-secrets.sh`

- [ ] **Step 3: Create `deploy/helm/gmvis/templates/sealed-secrets/prod/_README.md`**

```markdown
# Sealed secrets — prod

The two SealedSecret manifests for `prod-gmvis` live here once generated:

- `app-secrets.yaml` — Secret `gmvis-app`: `ADMIN_PASSWORD`, `SESSION_SECRET`
- `ghcr-pull-secret.yaml` — Secret `ghcr-pull`: GHCR image-pull dockerconfigjson

Generate them with `deploy/seal-secrets.sh` following
`docs/deployment-runbook.md` §2–3. They are encrypted against the cluster's
sealed-secrets controller (`--scope strict`, namespace `prod-gmvis`) and are
safe to commit. Files starting with `_` are ignored by Helm, so this README
never renders.
```

- [ ] **Step 4: Verify the script fails cleanly without kubeseal input and the chart still renders**

Run: `bash -n deploy/seal-secrets.sh && helm template gmvis-prod deploy/helm/gmvis --values deploy/helm/gmvis/values-prod.yaml --set image.tag=test > /dev/null && echo CHART-OK`
Expected: `CHART-OK` (bash syntax check passes; Helm ignores `_README.md`).

- [ ] **Step 5: Commit**

```bash
git add deploy/seal-secrets.sh deploy/helm/gmvis/templates/sealed-secrets/prod/_README.md
git commit -m "feat(deploy): kubeseal wrapper + sealed-secrets layout"
```

---

### Task 6: GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      ref:
        description: "Branch, tag, or SHA to build + deploy"
        required: true
        default: "main"
      deploy:
        description: "Deploy to gmvis-prod after build?"
        type: boolean
        default: true

permissions:
  contents: read
  packages: write

env:
  IMAGE_NAME: ghcr.io/${{ github.repository_owner }}/gmvis-web

jobs:
  build-push:
    name: Build and push image
    runs-on: ubuntu-latest
    outputs:
      image_tag: ${{ steps.meta.outputs.image_tag }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: ${{ inputs.ref || github.ref }}

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Compute tags
        id: meta
        run: |
          SHORT_SHA=$(git rev-parse --short=12 HEAD)
          IMAGE_TAG="sha-${SHORT_SHA}"
          TAGS="${IMAGE_NAME}:${IMAGE_TAG}"
          case "${{ github.event_name }}" in
            release)
              TAGS="${TAGS},${IMAGE_NAME}:${{ github.event.release.tag_name }},${IMAGE_NAME}:latest"
              ;;
            workflow_dispatch)
              TAGS="${TAGS},${IMAGE_NAME}:manual-${{ github.run_number }}"
              ;;
          esac
          {
            echo "image_tag=${IMAGE_TAG}"
            echo "tags<<TAGS_EOF"
            echo "${TAGS}"
            echo "TAGS_EOF"
          } >> "$GITHUB_OUTPUT"

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: server/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}

  deploy:
    name: Deploy to prod
    concurrency:
      group: deploy-gmvis-prod
      cancel-in-progress: false
    needs: build-push
    if: >
      github.event_name == 'release' ||
      (github.event_name == 'workflow_dispatch' && inputs.deploy == true)
    runs-on: ubuntu-latest
    env:
      APP: gmvis-prod
      NAMESPACE: prod-gmvis
      CHART_PATH: deploy/helm/gmvis
      IMAGE_TAG: ${{ needs.build-push.outputs.image_tag }}
      REF: ${{ inputs.ref || github.ref_name }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          ref: ${{ env.REF }}

      # Pin the argocd CLI so a downstream release on the argoproj/argo-cd
      # `latest` channel cannot quietly change deploy semantics (flag
      # rename, default flip) overnight. v3.4.2 is the version validated
      # by the bcewhub-app deploy pipeline this workflow mirrors. Bump
      # deliberately after smoke-testing in a workflow_dispatch run.
      - name: Install argocd CLI
        env:
          ARGOCD_VERSION: v3.4.2
        run: |
          curl --retry 5 --retry-delay 5 --retry-connrefused -fsSL \
            -o /tmp/argocd \
            "https://github.com/argoproj/argo-cd/releases/download/${ARGOCD_VERSION}/argocd-linux-amd64"
          chmod +x /tmp/argocd
          sudo mv /tmp/argocd /usr/local/bin/argocd
          argocd version --client

      - name: Deploy via ArgoCD
        env:
          ARGOCD_SERVER:   ${{ secrets.ARGOCD_SERVER }}
          ARGOCD_USERNAME: ${{ secrets.ARGOCD_USERNAME }}
          ARGOCD_PASSWORD: ${{ secrets.ARGOCD_PASSWORD }}
        run: |
          set -euo pipefail

          # Transient RPC / TCP blips between GHA and the ArgoCD endpoint do
          # happen; retry every call a handful of times before giving up.
          retry() {
            local i=0
            until "$@"; do
              i=$((i+1))
              if [ $i -ge 5 ]; then
                echo "::error::FAILED after 5 attempts: $*" >&2
                return 1
              fi
              echo "::warning::attempt $i failed, retrying in 15s..." >&2
              sleep 15
            done
          }

          retry argocd login "$ARGOCD_SERVER" \
            --username "$ARGOCD_USERNAME" \
            --password "$ARGOCD_PASSWORD" \
            --grpc-web

          retry argocd app create "$APP" \
            --upsert \
            --repo "https://github.com/borisnan99/GMVIS.git" \
            --path "$CHART_PATH" \
            --revision "$REF" \
            --dest-server "https://kubernetes.default.svc" \
            --dest-namespace "$NAMESPACE" \
            --sync-option CreateNamespace=true \
            --sync-option ServerSideApply=true \
            --sync-policy automated \
            --auto-prune \
            --self-heal \
            --values "values-prod.yaml" \
            --helm-set "image.tag=$IMAGE_TAG" \
            --grpc-web

          retry argocd app set "$APP" -p "image.tag=$IMAGE_TAG" --grpc-web

          # Do NOT run `argocd app sync` here. With `--sync-policy automated`
          # the `app set` above already changes desired state, which the
          # controller reconciles by starting an automated sync within seconds
          # (a spec/param change is reacted to immediately — it does not wait
          # for the ~3-min git poll). An explicit `app sync` then collides with
          # that in-flight auto-sync and fails with "another operation is
          # already in progress". One syncer only: ArgoCD owns the sync, CI
          # just changes the tag and waits for the result.
          #
          # `app get --refresh` forces a comparison refresh and blocks until
          # the new desired state (and the OutOfSync it produces) is registered
          # server-side, closing the race where `app wait` could otherwise read
          # the prior Synced/Healthy state and return before the new tag rolls.
          retry argocd app get "$APP" --refresh --grpc-web >/dev/null
          retry argocd app wait "$APP" --sync --health --operation --timeout 600 --grpc-web
```

- [ ] **Step 2: Validate the workflow YAML parses**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml')); print('YAML-OK')"`
Expected: `YAML-OK`. (If `actionlint` is on PATH, also run `actionlint .github/workflows/deploy.yml` — expected: no output.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat(ci): release-driven build + ArgoCD deploy workflow"
```

---

### Task 7: Deployment runbook

**Files:**
- Create: `docs/deployment-runbook.md`

- [ ] **Step 1: Create `docs/deployment-runbook.md`**

````markdown
# Deployment Runbook

Step-by-step for the one-off operator setup that takes the existing talos
cluster to a running `https://gmvis.org`. After this, the CI/CD pipeline
(GitHub Actions → ArgoCD) handles every subsequent deploy automatically.

- **Spec:** [`docs/superpowers/specs/2026-06-10-argocd-deployment-design.md`](superpowers/specs/2026-06-10-argocd-deployment-design.md)
- **Plan:** [`docs/superpowers/plans/2026-06-10-argocd-deployment.md`](superpowers/plans/2026-06-10-argocd-deployment.md)

## 0. Pre-flight

On your machine: `kubeseal`, `kubectl`, `openssl`, `helm`.

On the cluster (all already present on the talos cluster):
`ingress-nginx`, `cert-manager` with ClusterIssuer `letsencrypt-prod`,
`sealed-secrets` controller, `nfs-client` StorageClass, ArgoCD at a public
HTTPS endpoint, and the Cloudflare integration that honours the
`cloudflare.com/dns-enabled` Ingress annotation.

> **DNS caveat:** the Cloudflare automation only works if `gmvis.org` is a
> zone in the same Cloudflare account the cluster integration uses. If it
> isn't, create the A/CNAME record for `gmvis.org` → the cluster ingress IP
> manually after the first deploy, and remove the `cloudflare.com/dns-enabled`
> annotation from `deploy/helm/gmvis/values.yaml`.

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
2. Seal it:

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

Verify: the file starts `kind: SealedSecret` with an `encryptedData` block.

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
automated --auto-prune --self-heal` → `argocd app set -p image.tag=sha-<short>`
→ `argocd app get --refresh` → `argocd app wait` (10-min timeout).

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
the admin password, create a test post, upload a test image, confirm both
appear on `/blog.html` and `/gallery.html`. Finally verify persistence:

```bash
kubectl -n prod-gmvis rollout restart deploy/gmvis-web
kubectl -n prod-gmvis rollout status deploy/gmvis-web
# reload /blog.html — the test post and image must still be there
```

Delete the test post/image via `/admin.html` when done.

## Troubleshooting

- **Image pull errors:** the GHCR PAT in `ghcr-pull` lacks Packages:read, or
  the package `gmvis-web` is under a different owner. Regenerate + reseal (§2).
- **SealedSecret won't decrypt:** it was sealed for the wrong namespace or
  with the wrong cert (`--scope strict` binds name + namespace). Reseal with
  `SEALED_SECRETS_NAMESPACE=prod-gmvis`.
- **Cert never issues:** check `kubectl -n prod-gmvis describe certificate
  gmvis-web-tls`; usually DNS hasn't propagated (see §0 DNS caveat).
- **"another operation is already in progress" in CI:** a previous sync is
  still running; the retry loop normally rides this out. Never add a manual
  `argocd app sync` to the workflow.
- **Temporary manual override during an incident:**
  `argocd app set gmvis-prod --sync-policy none --grpc-web`, do the work, then
  re-enable with `--sync-policy automated --auto-prune --self-heal`. The next
  CI run re-asserts automated sync anyway.
````

- [ ] **Step 2: Verify internal links resolve**

Run: `ls docs/superpowers/specs/2026-06-10-argocd-deployment-design.md docs/superpowers/plans/2026-06-10-argocd-deployment.md`
Expected: both paths print (no "No such file").

- [ ] **Step 3: Commit**

```bash
git add docs/deployment-runbook.md
git commit -m "docs: operator deployment runbook (bootstrap to first release)"
```

---

### Task 8: Delete superseded deployment files and update docs

**Files:**
- Delete: `k8s/` (entire directory), `Dockerfile` (repo root), `nginx/` (entire directory)
- Modify: `README.md` (the `## Docker` and `## Kubernetes` sections and the architecture diagram around lines 50–160)
- Modify: `PROJECT_OVERVIEW.md` (tech-stack table row, repo-layout tree, architecture diagram, deploy instructions around lines 48, 98–108, 147–148, 235–250, 266, 288–289)

- [ ] **Step 1: Delete the superseded files**

```bash
git rm -r k8s nginx
git rm Dockerfile
```

(`server/Dockerfile` stays — it is THE production image now.)

- [ ] **Step 2: Update `README.md`**

Find the `## Docker` and `## Kubernetes` sections (use `grep -n "^## " README.md` to locate boundaries) and replace both sections entirely with:

```markdown
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
```

Also update the architecture diagram near line 55: the browser now talks to a
single Node/Express service (no nginx tier). Replace the two-tier diagram
lines with:

```
Browser ──► Node/Express ..... static site + /api/* + /media/*   [k8s: 1 replica]
                └── SQLite + uploads on a persistent volume (/data)
```

And update the line-50 warning to point at the runbook instead of
`k8s/api-secret.yaml`:

```markdown
> ⚠️ **Before deploying:** set a strong `ADMIN_PASSWORD` and a long random `SESSION_SECRET`. The defaults are for local development only — production values are SealedSecrets generated per [`docs/deployment-runbook.md`](docs/deployment-runbook.md).
```

- [ ] **Step 3: Update `PROJECT_OVERVIEW.md`**

Make these targeted edits (locate each with the grep from the task header):

1. Tech-stack table (~line 44–48): change the "Static image" row and "Orchestration" row to:
   - delete the `nginxinc/nginx-unprivileged` row entirely
   - `| Orchestration | Kubernetes + Helm + ArgoCD | deploy/helm/gmvis/, release-driven CI |`
2. Repo-layout tree (~lines 98–108): remove the `k8s/` and `nginx/default.conf` entries; add:
   ```
   ├── deploy/                    Helm chart + kubeseal wrapper (ArgoCD deploys this)
   │   ├── helm/gmvis/            chart: web Deployment/Service/Ingress/PVC + SealedSecrets
   │   └── seal-secrets.sh
   ├── .github/workflows/deploy.yml  Release → build ghcr.io image → ArgoCD sync
   ```
3. Architecture diagram (~lines 147–148): same single-tier replacement as README Step 2.
4. Deploy instructions (~lines 235–250, the `cd k8s … kubectl apply -k` block): replace the whole block with:
   ```markdown
   Deploys are release-driven: publish a GitHub Release and
   `.github/workflows/deploy.yml` builds `ghcr.io/borisnan99/gmvis-web` and
   syncs the ArgoCD app `gmvis-prod` (namespace `prod-gmvis`). Chart:
   `deploy/helm/gmvis/`. First-time bootstrap: `docs/deployment-runbook.md`.
   ```
5. Secrets note (~line 266): replace the `k8s/api-secret.yaml` sentence with: "Production secrets are SealedSecrets in `deploy/helm/gmvis/templates/sealed-secrets/prod/`, generated via `deploy/seal-secrets.sh` (see the runbook)."
6. Pointers (~lines 288–289): replace `nginx behaviour → nginx/default.conf` and `Deployment → Dockerfile, server/Dockerfile, k8s/` with `Deployment → server/Dockerfile, deploy/helm/gmvis/, .github/workflows/deploy.yml`.

- [ ] **Step 4: Verify no stale references remain**

Run: `grep -rn "k8s/\|nginx/default.conf\|kubectl apply -k\|gmvis-api:latest" README.md PROJECT_OVERVIEW.md docs/ --include="*.md" | grep -v "superpowers/" | grep -v deployment-runbook`
Expected: no output. (The spec/plan/runbook under `docs/` may legitimately mention the old layout historically.)

- [ ] **Step 5: Verify the app and tests are untouched**

Run: `git status --short -- server/ assets/ tests/ *.html`
Expected: no output (nothing app-side changed).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove superseded k8s/nginx deployment, point docs at Helm+ArgoCD"
```

---

### Task 9: Final verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Full chart render + schema validation**

Run:
```bash
helm template gmvis-prod deploy/helm/gmvis \
  --values deploy/helm/gmvis/values-prod.yaml \
  --set image.tag=sha-final123 > /tmp/gmvis-rendered.yaml
grep -c '^kind:' /tmp/gmvis-rendered.yaml
```
Expected: `4` (Deployment, Service, PersistentVolumeClaim, Ingress — SealedSecrets arrive later via the runbook).

- [ ] **Step 2: Fail-fast still works**

Run: `helm template gmvis-prod deploy/helm/gmvis --values deploy/helm/gmvis/values-prod.yaml 2>&1 | grep -o "image.tag must be set"`
Expected: `image.tag must be set`

- [ ] **Step 3: Workflow YAML still parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml')); print('YAML-OK')"`
Expected: `YAML-OK`

- [ ] **Step 4: Quick app smoke (nothing broke locally)**

Run: `cd server && npm ci --omit=dev >/dev/null 2>&1 && node -e "require('./src/db.js'); console.log('SERVER-OK')" && cd ..`
Expected: `SERVER-OK` (the server module graph still loads; deployment work touched no app code).

- [ ] **Step 5: Review the branch history**

Run: `git log --oneline main -10`
Expected: the 8 commits from Tasks 1–8 in order, each scoped as described.
