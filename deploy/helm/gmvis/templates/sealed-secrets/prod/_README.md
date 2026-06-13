# Sealed secrets — prod

The two SealedSecret manifests for `prod-gmvis` live here once generated:

- `app-secrets.yaml` — Secret `gmvis-app`: `ADMIN_PASSWORD`, `SESSION_SECRET`
- `ghcr-pull-secret.yaml` — Secret `ghcr-pull`: GHCR image-pull dockerconfigjson

Generate them with `deploy/seal-secrets.sh` following
`docs/deployment-runbook.md` §2–3. They are encrypted against the cluster's
sealed-secrets controller (`--scope strict`, namespace `prod-gmvis`) and are
safe to commit. Files starting with `_` are not rendered as manifests by Helm — but they ARE
still parsed by the template engine, so never paste template-syntax snippets
into this file.
