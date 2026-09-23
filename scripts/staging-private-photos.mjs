/** One-time staging-only Storage cutover. Never accepts a project argument. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { assertStagingEnvironment } from "../src/lib/staging-guard.ts";

const command = process.argv[2];
if (!["status", "make-private", "verify-private"].includes(command)) throw new Error("Use status, make-private, or verify-private.");
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: resolve(root, ".env.local"), override: true, quiet: true });
if (process.env.SPOODLY_ENV !== "staging") throw new Error("Staging marker is required.");
assertStagingEnvironment(process.env);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Staging Storage credentials are missing.");
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: bucket, error } = await client.storage.getBucket("spoods");
if (error || !bucket) throw new Error(`Could not inspect staging bucket: ${error?.message || "missing"}`);
console.log(`Verified staging bucket spoods: ${bucket.public ? "public" : "private"}`);
if (command === "verify-private") {
  if (bucket.public) throw new Error("Staging bucket remains public.");
  const { data: folders, error: listError } = await client.storage.from("spoods").list("", { limit: 100 });
  if (listError) throw new Error(`Could not list staging photos: ${listError.message}`);
  let sample = folders?.find((entry) => entry.id)?.name;
  if (!sample) {
    for (const folder of folders || []) {
      const { data: files, error: folderError } = await client.storage.from("spoods").list(folder.name, { limit: 1 });
      if (folderError) throw new Error(`Could not inspect staging photo folder: ${folderError.message}`);
      if (files?.[0]?.id) { sample = `${folder.name}/${files[0].name}`; break; }
    }
  }
  if (!sample) { console.log("No staging photo object available to check."); process.exit(0); }
  const publicUrl = client.storage.from("spoods").getPublicUrl(sample).data.publicUrl;
  const response = await fetch(publicUrl, { cache: "no-store" });
  if (response.ok) throw new Error("An old public photo URL still returned image bytes.");
  const { data: privateData, error: privateError } = await client.storage.from("spoods").download(sample);
  if (privateError || !privateData || privateData.size === 0) throw new Error("The staging server key could not download the private photo.");
  console.log(`Old public photo URL denied with HTTP ${response.status}.`);
  console.log("Staging server key can download the same private photo.");
  process.exit(0);
}
if (command === "status" || !bucket.public) process.exit(0);
const { error: updateError } = await client.storage.updateBucket("spoods", { public: false });
if (updateError) throw new Error(`Could not make staging bucket private: ${updateError.message}`);
const { data: updated, error: verifyError } = await client.storage.getBucket("spoods");
if (verifyError || !updated || updated.public) throw new Error("Staging bucket privacy could not be verified.");
console.log("Verified staging bucket spoods: private");
