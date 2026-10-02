import assert from "node:assert/strict";
import test from "node:test";
import { listBlogPosts, getBlogPost } from "../../lib/content/blog";

test("three seed posts exist with unique slugs", () => {
  const posts = listBlogPosts();
  assert.deepEqual([...new Set(posts.map((post) => post.slug))].sort(), [
    "feeding-basics-101",
    "first-week-with-your-jumper",
    "welcome-to-pollys-web",
  ]);
});

test("posts are listed newest first", () => {
  const dates = listBlogPosts().map((post) => post.date);
  const sorted = [...dates].sort((a, b) => b.localeCompare(a));
  assert.deepEqual(dates, sorted);
});

test("every post has an excerpt, tags, and rendered structure", () => {
  for (const post of listBlogPosts()) {
    const full = getBlogPost(post.slug);
    assert.ok(full, `missing: ${post.slug}`);
    assert.ok(full.excerpt.length > 0);
    assert.ok(full.tags.length >= 1);
    assert.ok(full.html.includes("<h2 id="));
  }
});

test("the welcome post tells the rebrand story", () => {
  const post = getBlogPost("welcome-to-pollys-web");
  assert.ok(post?.html.includes("Spoodly Space"));
});