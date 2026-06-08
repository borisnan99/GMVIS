# Greater Manchester Vis — static website
# Served by nginx as a non-root user (uid 101) on port 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine

# Copy operations need write access to system dirs, so do them as root,
# then drop back to the unprivileged nginx user for runtime.
USER root

# Server configuration
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Static site content
COPY index.html about.html activities.html news.html blog.html gallery.html \
     get-involved.html contact.html complaints.html 404.html admin.html \
     /usr/share/nginx/html/
COPY assets/  /usr/share/nginx/html/assets/
COPY uploads/ /usr/share/nginx/html/uploads/

RUN chown -R 101:101 /usr/share/nginx/html

# Run as the unprivileged nginx user
USER 101

EXPOSE 8080

# Basic container-level healthcheck (Kubernetes uses its own probes)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
