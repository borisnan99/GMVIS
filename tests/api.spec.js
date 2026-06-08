const { test, expect } = require("@playwright/test");

const PASSWORD = "test-admin-pass";
// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

test.describe("API — health & auth", () => {
  test("health endpoint responds ok", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.ok()).toBeTruthy();
    expect((await r.json()).ok).toBe(true);
  });

  test("session is unauthenticated without login", async ({ request }) => {
    const r = await request.get("/api/session");
    expect((await r.json()).authenticated).toBe(false);
  });

  test("wrong password is rejected", async ({ request }) => {
    const r = await request.post("/api/login", { data: { password: "wrong" } });
    expect(r.status()).toBe(401);
  });

  test("creating a post without auth is 401", async ({ request }) => {
    const r = await request.post("/api/posts", { data: { title: "Nope" } });
    expect(r.status()).toBe(401);
  });

  test("uploading without auth is 401", async ({ request }) => {
    const r = await request.post("/api/assets", {
      multipart: { file: { name: "x.png", mimeType: "image/png", buffer: PNG } },
    });
    expect(r.status()).toBe(401);
  });
});

test.describe("API — post lifecycle", () => {
  test("create, list, draft-hide, admin-see, delete", async ({ request }) => {
    const login = await request.post("/api/login", { data: { password: PASSWORD } });
    expect(login.ok()).toBeTruthy();

    const created = await request.post("/api/posts", {
      data: { title: "API lifecycle post", category: "Guides", author: "Tester", excerpt: "x", body: "para one\n\npara two", published: true },
    });
    expect(created.status()).toBe(201);
    const post = await created.json();
    expect(post.id).toBeTruthy();
    expect(post.published).toBe(true);

    // Public list includes published post
    let pub = await (await request.get("/api/posts")).json();
    expect(pub.some((p) => p.id === post.id)).toBeTruthy();

    // Make it a draft -> hidden from public, visible to admin
    const upd = await request.put("/api/posts/" + post.id, { data: { published: false } });
    expect(upd.ok()).toBeTruthy();
    pub = await (await request.get("/api/posts")).json();
    expect(pub.some((p) => p.id === post.id)).toBeFalsy();
    const all = await (await request.get("/api/posts?all=1")).json();
    expect(all.some((p) => p.id === post.id)).toBeTruthy();

    // Delete
    const del = await request.delete("/api/posts/" + post.id);
    expect(del.ok()).toBeTruthy();
    const after = await (await request.get("/api/posts?all=1")).json();
    expect(after.some((p) => p.id === post.id)).toBeFalsy();
  });

  test("title is required", async ({ request }) => {
    await request.post("/api/login", { data: { password: PASSWORD } });
    const r = await request.post("/api/posts", { data: { title: "   " } });
    expect(r.status()).toBe(400);
  });
});

test.describe("API — assets & media", () => {
  test("upload image, range request, delete removes media", async ({ request }) => {
    await request.post("/api/login", { data: { password: PASSWORD } });

    const up = await request.post("/api/assets", {
      multipart: {
        file: { name: "dot.png", mimeType: "image/png", buffer: PNG },
        title: "A dot",
        caption: "tiny dot",
      },
    });
    expect(up.status()).toBe(201);
    const asset = await up.json();
    expect(asset.kind).toBe("image");
    expect(asset.url).toContain("/media/");

    // Full fetch
    const media = await request.get(asset.url);
    expect(media.status()).toBe(200);
    expect(media.headers()["content-type"]).toContain("image/png");

    // Range request -> 206 Partial Content
    const ranged = await request.get(asset.url, { headers: { Range: "bytes=0-9" } });
    expect(ranged.status()).toBe(206);

    // Delete -> media gone
    const del = await request.delete("/api/assets/" + asset.id);
    expect(del.ok()).toBeTruthy();
    const gone = await request.get(asset.url);
    expect(gone.status()).toBe(404);
  });

  test("rejects unsupported file type", async ({ request }) => {
    await request.post("/api/login", { data: { password: PASSWORD } });
    const r = await request.post("/api/assets", {
      multipart: { file: { name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"a":1}') } },
    });
    expect(r.status()).toBe(400);
  });

  test("kind filter returns only matching assets", async ({ request }) => {
    await request.post("/api/login", { data: { password: PASSWORD } });
    await request.post("/api/assets", {
      multipart: { file: { name: "k.png", mimeType: "image/png", buffer: PNG }, title: "kind-test" },
    });
    const images = await (await request.get("/api/assets?kind=image")).json();
    expect(images.every((a) => a.kind === "image")).toBe(true);
    const videos = await (await request.get("/api/assets?kind=video")).json();
    expect(videos.every((a) => a.kind === "video")).toBe(true);
  });
});
