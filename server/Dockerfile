# Greater Manchester Vis — admin API (Node.js)
# Build from the repository root:  docker build -f server/Dockerfile -t gmvis-api .
FROM node:24-slim

ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/data \
    SITE_DIR=/site

WORKDIR /app

# Production dependencies (reproducible install)
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application source
COPY server/src ./src

# Static site, so this image can also serve the whole site standalone (local
# dev). In Kubernetes nginx fronts the static site and this serves /api + /media.
COPY index.html about.html activities.html news.html blog.html gallery.html \
     get-involved.html contact.html complaints.html 404.html admin.html \
     /site/
COPY assets/  /site/assets/
COPY uploads/ /site/uploads/

# Writable data dir (mounted as a volume in production)
RUN mkdir -p /data && chown -R node:node /data /app /site

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
