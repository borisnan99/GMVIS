/* ==========================================================================
   Greater Manchester Vis — public dynamic content
   Renders blog posts (#blog-posts) and the media gallery (#gallery-grid)
   from the API. Uses textContent / DOM nodes (never innerHTML with API data).
   ========================================================================== */
(function () {
  "use strict";

  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function emptyState(msg) { var d = el("div", "content-empty"); d.textContent = msg; return d; }
  function formatDate(iso) {
    try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
    catch (e) { return iso; }
  }
  async function fetchJSON(url) {
    var r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  function setPills(pills, active) {
    pills.forEach(function (x) {
      var on = x === active;
      x.setAttribute("aria-pressed", on ? "true" : "false");
      x.style.background = on ? "var(--purple-600)" : "";
      x.style.color = on ? "#fff" : "";
    });
  }

  /* ---------------- Blog ---------------- */
  var blogContainer = document.getElementById("blog-posts");
  if (blogContainer) initBlog(blogContainer);

  async function initBlog(container) {
    var posts;
    try { posts = await fetchJSON("/api/posts"); }
    catch (e) { container.appendChild(emptyState("Posts are unavailable right now. Please try again later.")); return; }

    var pills = Array.prototype.slice.call(
      document.querySelectorAll('[aria-label="Filter posts by category"] button')
    );
    var current = "All posts";

    function render() {
      container.innerHTML = "";
      var list = current === "All posts" ? posts : posts.filter(function (p) { return p.category === current; });
      if (!list.length) { container.appendChild(emptyState("No posts in this category yet.")); return; }
      list.forEach(function (p) { container.appendChild(renderBlogCard(p)); });
    }

    pills.forEach(function (b) {
      b.addEventListener("click", function () {
        setPills(pills, b);
        current = b.textContent.trim();
        render();
      });
    });
    render();
  }

  function renderBody(text) {
    return String(text).split(/\n\s*\n/).filter(function (s) { return s.trim(); }).map(function (par) {
      var p = el("p"); p.style.marginTop = "10px"; p.textContent = par.trim(); return p;
    });
  }

  function renderBlogCard(p) {
    var card = el("article", "card");
    card.style.padding = "0";
    card.style.overflow = "hidden";

    if (p.coverUrl) {
      var img = document.createElement("img");
      img.src = p.coverUrl; img.alt = ""; img.setAttribute("aria-hidden", "true"); img.loading = "lazy";
      img.style.cssText = "width:100%; height:190px; object-fit:cover";
      card.appendChild(img);
    } else {
      var ph = el("div", "ph");
      ph.setAttribute("aria-hidden", "true");
      ph.style.borderRadius = "0"; ph.style.minHeight = "170px";
      card.appendChild(ph);
    }

    var inner = el("div"); inner.style.padding = "24px";
    var tag = el("span", "tag"); tag.textContent = p.category; inner.appendChild(tag);
    var h = el("h3", "h3"); h.style.cssText = "font-size:1.22rem; margin:8px 0 10px"; h.textContent = p.title; inner.appendChild(h);
    if (p.excerpt) {
      var ex = el("p"); ex.style.cssText = "color:var(--ink-soft); font-size:.96rem"; ex.textContent = p.excerpt; inner.appendChild(ex);
    }
    var meta = el("p");
    meta.style.cssText = "font-family:var(--font-head); font-weight:700; font-size:.85rem; color:var(--purple-600); margin:12px 0 0";
    meta.textContent = (p.author ? p.author + " · " : "") + formatDate(p.createdAt);
    inner.appendChild(meta);

    if (p.body && p.body.trim()) {
      var det = document.createElement("details"); det.style.marginTop = "12px";
      var sum = document.createElement("summary");
      sum.textContent = "Read the full story";
      sum.style.cssText = "cursor:pointer; font-family:var(--font-head); font-weight:700; color:var(--purple-600)";
      det.appendChild(sum);
      renderBody(p.body).forEach(function (node) { det.appendChild(node); });
      inner.appendChild(det);
    }
    card.appendChild(inner);
    return card;
  }

  /* ---------------- Gallery ---------------- */
  var galleryGrid = document.getElementById("gallery-grid");
  if (galleryGrid) initGallery(galleryGrid);

  async function initGallery(grid) {
    var assets;
    try { assets = await fetchJSON("/api/assets"); }
    catch (e) { grid.appendChild(emptyState("The gallery is unavailable right now. Please try again later.")); return; }

    var pills = Array.prototype.slice.call(
      document.querySelectorAll('[aria-label="Filter gallery"] button')
    );
    var current = "All";

    function render() {
      grid.innerHTML = "";
      var list = assets;
      if (current === "Photos") list = assets.filter(function (a) { return a.kind === "image"; });
      else if (current === "Videos") list = assets.filter(function (a) { return a.kind === "video"; });
      if (!list.length) { grid.appendChild(emptyState("Nothing here yet — check back soon.")); return; }
      list.forEach(function (a) { grid.appendChild(renderGalleryItem(a)); });
    }

    pills.forEach(function (b) {
      b.addEventListener("click", function () {
        setPills(pills, b);
        current = b.textContent.trim();
        render();
      });
    });
    render();
  }

  function renderGalleryItem(a) {
    var fig = el("figure", "gallery-item");
    if (a.kind === "image") {
      var img = document.createElement("img");
      img.src = a.url; img.loading = "lazy";
      img.alt = a.caption || a.title || "Gallery photograph";
      fig.appendChild(img);
    } else {
      var v = document.createElement("video");
      v.src = a.url; v.controls = true; v.preload = "metadata";
      v.setAttribute("aria-label", a.title || a.caption || "Gallery video");
      fig.appendChild(v);
    }
    if (a.title || a.caption) {
      var cap = document.createElement("figcaption");
      var t = a.title || "", c = a.caption || "";
      cap.textContent = t && c ? t + " — " + c : (t || c);
      fig.appendChild(cap);
    }
    return fig;
  }
})();
