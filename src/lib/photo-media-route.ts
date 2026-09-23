import { storagePathFromReference } from "./photo-media";

type PrivatePhotoDependencies = {
  userId: string | null;
  storageOrigin: string;
  ownsReference: (reference: string, userId: string) => Promise<boolean>;
  download: (path: string) => Promise<Blob | null>;
};

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const rasterTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function servePrivatePhoto(request: Request, deps: PrivatePhotoDependencies): Promise<Response> {
  if (!deps.userId) return new Response(null, { status: 401, headers });
  const reference = new URL(request.url).searchParams.get("ref") || "";
  const path = storagePathFromReference(reference, deps.storageOrigin);
  if (!path) return new Response(null, { status: 404, headers });
  let owned: boolean;
  try {
    owned = await deps.ownsReference(reference, deps.userId);
  } catch {
    return new Response(null, { status: 503, headers });
  }
  if (!owned) {
    return new Response(null, { status: 404, headers });
  }

  let blob: Blob | null;
  try {
    blob = await deps.download(path);
  } catch {
    return new Response(null, { status: 503, headers });
  }
  if (!blob) return new Response(null, { status: 404, headers });
  if (!rasterTypes.has(blob.type.toLowerCase()) || blob.size > 5 * 1024 * 1024) {
    return new Response(null, { status: 415, headers });
  }
  return new Response(await blob.arrayBuffer(), {
    status: 200,
    headers: { ...headers, "Content-Type": blob.type.toLowerCase() },
  });
}
