const BLOG_STORAGE_KEY = "gmvis_blog_posts";

const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const readPosts = () => {
  try {
    const raw = localStorage.getItem(BLOG_STORAGE_KEY);
    if (!raw) {
      return [
        {
          id: String(Date.now()),
          title: "Welcome to GM Vis",
          author: "Admin",
          content: "We are excited to launch our community blog and share updates.",
          updatedAt: new Date().toISOString(),
        },
      ];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const savePosts = (posts) => {
  localStorage.setItem(BLOG_STORAGE_KEY, JSON.stringify(posts));
};

const renderPosts = (posts) => {
  const container = document.getElementById("blog-posts");
  if (!container) {
    return;
  }

  if (!posts.length) {
    container.innerHTML = "<p>No blog posts yet.</p>";
    return;
  }

  container.innerHTML = posts
    .slice()
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .map(
      (post) => `
      <article>
        <h3>${escapeHtml(post.title)}</h3>
        <p class="muted">By ${escapeHtml(post.author)} · ${new Date(post.updatedAt).toLocaleString()}</p>
        <p>${escapeHtml(post.content).replaceAll("\n", "<br>")}</p>
        <button type="button" data-edit-id="${escapeHtml(post.id)}">Edit</button>
      </article>
    `
    )
    .join("");
};

const setupBlog = () => {
  const form = document.getElementById("blog-form");
  const message = document.getElementById("blog-message");
  const cancelEdit = document.getElementById("cancel-edit");

  if (!form || !message || !cancelEdit) {
    return;
  }

  let posts = readPosts();
  savePosts(posts);
  renderPosts(posts);

  const idInput = document.getElementById("post-id");
  const titleInput = document.getElementById("post-title");
  const authorInput = document.getElementById("post-author");
  const contentInput = document.getElementById("post-content");

  const resetForm = (clearMessage = true) => {
    form.reset();
    idInput.value = "";
    if (clearMessage) {
      message.textContent = "";
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const id = idInput.value || String(Date.now());
    const nextPost = {
      id,
      title: titleInput.value.trim(),
      author: authorInput.value.trim(),
      content: contentInput.value.trim(),
      updatedAt: new Date().toISOString(),
    };

    if (!nextPost.title || !nextPost.author || !nextPost.content) {
      message.textContent = "Please complete all fields.";
      return;
    }

    const existingIndex = posts.findIndex((post) => post.id === id);
    if (existingIndex >= 0) {
      posts[existingIndex] = nextPost;
      message.textContent = "Post updated.";
    } else {
      posts.push(nextPost);
      message.textContent = "Post added.";
    }

    savePosts(posts);
    renderPosts(posts);
    resetForm(false);
  });

  cancelEdit.addEventListener("click", () => resetForm(true));

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const id = target.getAttribute("data-edit-id");
    if (!id) {
      return;
    }

    const post = posts.find((item) => item.id === id);
    if (!post) {
      return;
    }

    idInput.value = post.id;
    titleInput.value = post.title;
    authorInput.value = post.author;
    contentInput.value = post.content;
    message.textContent = "Editing selected post.";
    titleInput.focus();
  });
};

const setupForm = (formId, statusId, successMessage) => {
  const form = document.getElementById(formId);
  const status = document.getElementById(statusId);

  if (!form || !status) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());
    localStorage.setItem(`${formId}_last_submission`, JSON.stringify(payload));
    status.textContent = successMessage;
    form.reset();
  });
};

setupBlog();
setupForm("contact-form", "contact-status", "Thanks. Your enquiry has been recorded.");
setupForm("complaints-form", "complaints-status", "Thanks. Your complaint has been recorded for review.");
