/* ==========================================================================
   Greater Manchester Vis — admin portal
   Login (shared password) + blog post CRUD + media (image/video) CRUD.
   Talks to the API at /api/*. Rendering uses textContent / DOM nodes
   (never innerHTML with server data) to avoid injection.
   ========================================================================== */
(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls) { var e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function btn(text, cls) { var b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = text; return b; }
  function emptyState(msg) { var d = el("div", "admin-empty"); d.textContent = msg; return d; }
  function formatDate(iso) {
    try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
    catch (e) { return iso; }
  }

  /* ---------- API helpers ---------- */
  async function api(path, opts) {
    var res = await fetch(path, Object.assign({ credentials: "same-origin" }, opts || {}));
    var data = null;
    if ((res.headers.get("content-type") || "").indexOf("application/json") !== -1) {
      try { data = await res.json(); } catch (e) {}
    }
    if (!res.ok) {
      var err = new Error((data && data.error) || ("Request failed (" + res.status + ")"));
      err.status = res.status;
      throw err;
    }
    return data;
  }
  function jsonReq(method, path, body) {
    return api(path, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  /* ---------- Status toast ---------- */
  var statusEl = $("#status");
  var statusTimer;
  function showStatus(msg, kind) {
    statusEl.textContent = msg;
    statusEl.setAttribute("data-kind", kind || "success");
    statusEl.setAttribute("data-show", "true");
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { statusEl.removeAttribute("data-show"); }, 4500);
  }

  /* ---------- Views ---------- */
  var loginView = $("#login-view");
  var dashView = $("#dash-view");
  var logoutBtn = $("#logout-btn");

  function showLogin() {
    loginView.hidden = false;
    dashView.hidden = true;
    logoutBtn.hidden = true;
    var pw = $("#admin-pw"); if (pw) pw.focus();
  }
  function showDash() {
    loginView.hidden = true;
    dashView.hidden = false;
    logoutBtn.hidden = false;
    loadPosts();
    loadAssets();
  }

  /* ---------- Login / logout ---------- */
  $("#login-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var pw = $("#admin-pw");
    var errEl = $("#login-error");
    pw.setAttribute("aria-invalid", "false");
    errEl.textContent = "";
    if (!pw.value) {
      pw.setAttribute("aria-invalid", "true");
      errEl.textContent = "Please enter the password.";
      pw.focus();
      return;
    }
    var submit = $("#login-submit");
    submit.disabled = true; submit.setAttribute("aria-busy", "true");
    try {
      await jsonReq("POST", "/api/login", { password: pw.value });
      pw.value = "";
      showDash();
      showStatus("Signed in.", "success");
    } catch (err) {
      pw.setAttribute("aria-invalid", "true");
      errEl.textContent = err.message || "Sign in failed.";
      pw.focus();
    } finally {
      submit.disabled = false; submit.removeAttribute("aria-busy");
    }
  });

  logoutBtn.addEventListener("click", async function () {
    try { await jsonReq("POST", "/api/logout"); } catch (e) {}
    showLogin();
    showStatus("Signed out.", "success");
  });

  /* ---------- Tabs ---------- */
  var tabs = [$("#tab-posts"), $("#tab-media")];
  var panels = { "tab-posts": $("#panel-posts"), "tab-media": $("#panel-media") };
  function selectTab(tab) {
    tabs.forEach(function (t) {
      var sel = t === tab;
      t.setAttribute("aria-selected", sel ? "true" : "false");
      t.tabIndex = sel ? 0 : -1;
      panels[t.id].hidden = !sel;
    });
    tab.focus();
  }
  tabs.forEach(function (t) { t.addEventListener("click", function () { selectTab(t); }); });
  $(".admin-tabs").addEventListener("keydown", function (e) {
    var i = tabs.indexOf(document.activeElement);
    if (i === -1) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      var ni = e.key === "ArrowRight" ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
      selectTab(tabs[ni]);
    }
  });

  /* ---------- Posts ---------- */
  var postsList = $("#posts-list");
  var postForm = $("#post-form");

  async function loadPosts() {
    postsList.innerHTML = "";
    var posts;
    try { posts = await api("/api/posts?all=1"); }
    catch (e) { postsList.appendChild(emptyState("Could not load posts: " + e.message)); return; }
    if (!posts.length) { postsList.appendChild(emptyState("No posts yet. Create your first post.")); return; }
    posts.forEach(function (p) { postsList.appendChild(renderPostRow(p)); });
  }

  function renderPostRow(p) {
    var row = el("div", "admin-row");
    var left = el("div");
    var h = el("h3"); h.textContent = p.title; left.appendChild(h);
    var meta = el("div", "meta");
    var badge = el("span", "badge" + (p.published ? "" : " draft"));
    badge.textContent = p.published ? "Published" : "Draft";
    meta.appendChild(badge);
    meta.appendChild(document.createTextNode(" "));
    var cat = el("span", "badge"); cat.textContent = p.category; meta.appendChild(cat);
    meta.appendChild(document.createTextNode(" · " + formatDate(p.createdAt) + (p.author ? " · " + p.author : "")));
    left.appendChild(meta);
    row.appendChild(left);

    var actions = el("div", "row-actions");
    var edit = btn("Edit", "btn btn-sm");
    edit.setAttribute("aria-label", "Edit post: " + p.title);
    edit.addEventListener("click", function () { openPostEditor(p); });
    var del = btn("Delete", "btn btn-sm btn-danger");
    del.setAttribute("aria-label", "Delete post: " + p.title);
    del.addEventListener("click", function () { deletePost(p); });
    actions.appendChild(edit); actions.appendChild(del);
    row.appendChild(actions);
    return row;
  }

  async function populateCoverOptions() {
    var sel = $("#post-cover");
    sel.querySelectorAll("option:not(:first-child)").forEach(function (o) { o.remove(); });
    var imgs = [];
    try { imgs = await api("/api/assets?kind=image"); } catch (e) {}
    imgs.forEach(function (a) {
      var o = document.createElement("option");
      o.value = String(a.id);
      o.textContent = a.title || a.originalName || ("Image " + a.id);
      sel.appendChild(o);
    });
  }

  async function openPostEditor(p) {
    await populateCoverOptions();
    $("#post-form-title").textContent = p ? "Edit post" : "New post";
    $("#post-id").value = p ? p.id : "";
    $("#post-title").value = p ? p.title : "";
    $("#post-category").value = p ? p.category : "Member voices";
    $("#post-author").value = p ? p.author : "";
    $("#post-excerpt").value = p ? p.excerpt : "";
    $("#post-body").value = p ? p.body : "";
    $("#post-cover").value = p && p.coverAssetId ? String(p.coverAssetId) : "";
    $("#post-published").checked = p ? p.published : true;
    $("#post-title").setAttribute("aria-invalid", "false");
    postForm.hidden = false;
    $("#post-title").focus();
    postForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  postForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var title = $("#post-title");
    title.setAttribute("aria-invalid", "false");
    if (!title.value.trim()) { title.setAttribute("aria-invalid", "true"); title.focus(); return; }
    var id = $("#post-id").value;
    var payload = {
      title: title.value.trim(),
      category: $("#post-category").value,
      author: $("#post-author").value.trim(),
      excerpt: $("#post-excerpt").value.trim(),
      body: $("#post-body").value,
      coverAssetId: $("#post-cover").value || null,
      published: $("#post-published").checked,
    };
    var save = $("#post-save");
    save.disabled = true; save.setAttribute("aria-busy", "true");
    try {
      if (id) { await jsonReq("PUT", "/api/posts/" + id, payload); showStatus("Post updated.", "success"); }
      else { await jsonReq("POST", "/api/posts", payload); showStatus("Post created.", "success"); }
      postForm.hidden = true;
      $("#new-post-btn").focus();
      loadPosts();
    } catch (err) {
      showStatus("Could not save post: " + err.message, "error");
    } finally {
      save.disabled = false; save.removeAttribute("aria-busy");
    }
  });

  $("#post-cancel").addEventListener("click", function () { postForm.hidden = true; $("#new-post-btn").focus(); });
  $("#new-post-btn").addEventListener("click", function () { openPostEditor(null); });

  async function deletePost(p) {
    if (!window.confirm('Delete the post "' + p.title + '"? This cannot be undone.')) return;
    try { await jsonReq("DELETE", "/api/posts/" + p.id); showStatus("Post deleted.", "success"); loadPosts(); }
    catch (err) { showStatus("Could not delete post: " + err.message, "error"); }
  }

  /* ---------- Media / assets ---------- */
  var assetsGrid = $("#assets-grid");

  async function loadAssets() {
    assetsGrid.innerHTML = "";
    var assets;
    try { assets = await api("/api/assets"); }
    catch (e) { assetsGrid.appendChild(emptyState("Could not load media: " + e.message)); return; }
    if (!assets.length) { assetsGrid.appendChild(emptyState("No media yet. Upload your first image or video.")); return; }
    assets.forEach(function (a) { assetsGrid.appendChild(renderAssetCard(a)); });
  }

  function renderAssetCard(a) {
    var card = el("div", "media-card");
    var thumb = el("div", "thumb");
    if (a.kind === "image") {
      var img = document.createElement("img");
      img.src = a.url; img.alt = a.caption || a.title || ""; img.loading = "lazy";
      thumb.appendChild(img);
    } else {
      var v = document.createElement("video");
      v.src = a.url; v.controls = true; v.preload = "metadata";
      thumb.appendChild(v);
    }
    card.appendChild(thumb);

    var body = el("div", "media-body");
    var kind = el("div", "kind"); kind.textContent = a.kind; body.appendChild(kind);

    var ed = el("div", "media-edit");
    var ti = document.createElement("input");
    ti.className = "input"; ti.value = a.title || ""; ti.placeholder = "Title";
    ti.setAttribute("aria-label", "Title for " + a.kind + " " + a.id);
    var ci = document.createElement("input");
    ci.className = "input"; ci.value = a.caption || ""; ci.placeholder = "Caption / alt text";
    ci.setAttribute("aria-label", "Caption for " + a.kind + " " + a.id);
    ed.appendChild(ti); ed.appendChild(ci);
    body.appendChild(ed);

    var actions = el("div", "row-actions");
    var save = btn("Save", "btn btn-sm");
    save.setAttribute("aria-label", "Save details for " + a.kind + " " + a.id);
    save.addEventListener("click", function () { saveAsset(a, ti.value, ci.value); });
    var del = btn("Delete", "btn btn-sm btn-danger");
    del.setAttribute("aria-label", "Delete " + a.kind + " " + a.id);
    del.addEventListener("click", function () { deleteAsset(a); });
    actions.appendChild(save); actions.appendChild(del);
    body.appendChild(actions);

    card.appendChild(body);
    return card;
  }

  $("#upload-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    var fileInput = $("#upload-file");
    fileInput.setAttribute("aria-invalid", "false");
    if (!fileInput.files || !fileInput.files.length) {
      fileInput.setAttribute("aria-invalid", "true"); fileInput.focus(); return;
    }
    var fd = new FormData();
    fd.append("file", fileInput.files[0]);
    fd.append("title", $("#upload-title").value.trim());
    fd.append("caption", $("#upload-caption").value.trim());
    var submit = $("#upload-submit");
    var orig = submit.textContent;
    submit.disabled = true; submit.setAttribute("aria-busy", "true"); submit.textContent = "Uploading…";
    try {
      await api("/api/assets", { method: "POST", body: fd });
      showStatus("Media uploaded.", "success");
      $("#upload-form").reset();
      loadAssets();
    } catch (err) {
      showStatus("Upload failed: " + err.message, "error");
    } finally {
      submit.disabled = false; submit.removeAttribute("aria-busy"); submit.textContent = orig;
    }
  });

  async function saveAsset(a, title, caption) {
    try { await jsonReq("PUT", "/api/assets/" + a.id, { title: title.trim(), caption: caption.trim() }); showStatus("Media updated.", "success"); loadAssets(); }
    catch (err) { showStatus("Could not save media: " + err.message, "error"); }
  }
  async function deleteAsset(a) {
    if (!window.confirm("Delete this " + a.kind + "? This cannot be undone.")) return;
    try { await jsonReq("DELETE", "/api/assets/" + a.id); showStatus("Media deleted.", "success"); loadAssets(); }
    catch (err) { showStatus("Could not delete media: " + err.message, "error"); }
  }

  /* ---------- Init ---------- */
  api("/api/session")
    .then(function (s) { if (s && s.authenticated) showDash(); else showLogin(); })
    .catch(function () { showLogin(); });
})();
