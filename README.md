# GMVIS
Greater Manchester Vis — community website for blind and partially sighted people across Greater Manchester.

## Pages
| File | Page |
|---|---|
| `index.html` | Home |
| `about.html` | About / Who We Are |
| `activities.html` | Activities (VI cricket, goalball, football, beep baseball, walks, socials) |
| `news.html` | News & Events |
| `blog.html` | Blog (add/edit posts stored in localStorage) |
| `get-involved.html` | Get Involved / Volunteer |
| `contact.html` | General enquiries form |
| `complaints.html` | Complaints form |

## Assets
Shared design system lives in `assets/`:
- `styles.css` — design tokens, components, accessibility themes (high-contrast, dyslexia font)
- `app.js` — accessibility toolbar, mobile nav, read-aloud, form validation
- `falcon.svg`, `team-photo.jpg`, `team-photo-lg.jpg` — logo and team imagery

## Run locally

No build step required — it is a plain static site.

**Python (built-in):**
```bash
python3 -m http.server 8080
```

**Node (npx):**
```bash
npx serve .
```

**VS Code:** install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension, then click **Go Live** in the status bar.

Then open `http://localhost:8080` in your browser.

> The site must be served over HTTP (not opened as a `file://` URL) so that the accessibility toolbar's localStorage and the Web Speech API read-aloud work correctly.

## Testing

End-to-end tests (Playwright + axe-core) cover functionality, navigation, forms and WCAG 2.1 AA accessibility across all pages:

```bash
npm install
npx playwright install chromium
npm test            # run the full suite
npm run test:report # open the HTML report
```

## Docker

The site ships as a small (~77 MB) nginx image that runs as a **non-root** user on port **8080** and works with a **read-only root filesystem**.

```bash
# Build
docker build -t gmvis:latest .

# Run locally (mimicking the production hardening)
docker run --rm -p 8080:8080 \
  --user 101:101 --read-only --tmpfs /tmp --tmpfs /var/cache/nginx \
  gmvis:latest
```

Then open `http://localhost:8080`. A health endpoint is exposed at `/healthz`.

Server config (gzip, long-lived asset caching, security headers, pretty URLs, branded `404.html`) lives in [`nginx/default.conf`](nginx/default.conf).

### Push to a registry

```bash
docker tag gmvis:latest <registry>/gmvis:1.0.0   # e.g. ghcr.io/borisnan99/gmvis:1.0.0
docker push <registry>/gmvis:1.0.0
```

## Kubernetes

Manifests live in [`k8s/`](k8s/): a `Deployment` (2 replicas, rolling updates, liveness/readiness probes on `/healthz`, hardened `securityContext`), a `ClusterIP` `Service`, and an `Ingress`.

1. Set your image. Either edit `k8s/deployment.yaml`, or use kustomize:
   ```bash
   cd k8s && kustomize edit set image gmvis=<registry>/gmvis:1.0.0 && cd ..
   ```
2. Set your domain and ingress class in `k8s/ingress.yaml` (replace `gmvis.example.com` and `ingressClassName`).
3. Deploy:
   ```bash
   kubectl apply -k k8s/
   ```
4. Check rollout:
   ```bash
   kubectl rollout status deployment/gmvis-web
   ```

The pods run as uid 101 with `runAsNonRoot`, `readOnlyRootFilesystem`, all Linux capabilities dropped, and `seccompProfile: RuntimeDefault`. Writable `emptyDir` volumes are mounted at `/tmp` and `/var/cache/nginx` for nginx's runtime needs.
