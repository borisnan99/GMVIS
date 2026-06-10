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
