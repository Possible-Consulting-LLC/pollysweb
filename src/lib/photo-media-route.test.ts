import assert from "node:assert/strict";
import test from "node:test";
import { servePrivatePhoto } from "./photo-media-route";

const storageOrigin = "https://staging-ref.supabase.co";
const reference = "spood-storage:keeper/photo.webp";
const request = () => new Request(`https://app.example/api/photos?ref=${encodeURIComponent(reference)}`);

test("anonymous and unowned references never reach Storage", async () => {
  let downloads = 0;
  const download = async () => { downloads++; return new Blob(["photo"], { type: "image/webp" }); };
  const anonymous = await servePrivatePhoto(request(), { userId: null, storageOrigin, ownsReference: async () => true, download });
  const foreign = await servePrivatePhoto(request(), { userId: "someone-else", storageOrigin, ownsReference: async () => false, download });
  assert.equal(anonymous.status, 401);
  assert.equal(foreign.status, 404);
  assert.equal(downloads, 0);
  assert.equal(foreign.headers.get("Cache-Control"), "private, no-store");
});

test("owned reference downloads its validated bucket path as private raster bytes", async () => {
  const response = await servePrivatePhoto(request(), {
    userId: "keeper",
    storageOrigin,
    ownsReference: async (ref, owner) => ref === reference && owner === "keeper",
    download: async (path) => path === "keeper/photo.webp" ? new Blob(["photo"], { type: "image/webp" }) : null,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/webp");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(await response.text(), "photo");
});

test("invalid references and non-raster Storage content are denied", async () => {
  const malformed = await servePrivatePhoto(new Request("https://app.example/api/photos?ref=spood-storage%3A..%2Fsecret"), {
    userId: "keeper", storageOrigin, ownsReference: async () => true,
    download: async () => new Blob(["photo"], { type: "image/webp" }),
  });
  const svg = await servePrivatePhoto(request(), {
    userId: "keeper", storageOrigin, ownsReference: async () => true,
    download: async () => new Blob(["<svg></svg>"], { type: "image/svg+xml" }),
  });
  assert.equal(malformed.status, 404);
  assert.equal(svg.status, 415);
  assert.equal(svg.headers.get("X-Content-Type-Options"), "nosniff");
});

test("Storage failure returns an uncached error response", async () => {
  const response = await servePrivatePhoto(request(), {
    userId: "keeper", storageOrigin, ownsReference: async () => true,
    download: async () => { throw new Error("Storage unavailable"); },
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});

test("ownership lookup failure returns an uncached error response before Storage access", async () => {
  const response = await servePrivatePhoto(request(), {
    userId: "keeper", storageOrigin,
    ownsReference: async () => { throw new Error("Database unavailable"); },
    download: async () => { throw new Error("download must not run"); },
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
});
