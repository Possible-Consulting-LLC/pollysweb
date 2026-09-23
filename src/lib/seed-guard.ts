export function validateDemoSeedTarget(
  env: Record<string, string | undefined>,
): string | null {
  if (env.SPOODLY_ALLOW_DEMO_SEED !== "true") {
    return "Demo seed blocked: set SPOODLY_ALLOW_DEMO_SEED=true only for a disposable local database.";
  }
  if (env.NODE_ENV === "production") {
    return "Demo seed blocked in production.";
  }
  const raw = env.DATABASE_URL?.trim();
  if (!raw) return "Demo seed blocked: DATABASE_URL must point to a local database.";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Demo seed blocked: DATABASE_URL must be a valid local database URL.";
  }
  if (!(["localhost", "127.0.0.1", "::1"] as readonly string[]).includes(url.hostname)) {
    return "Demo seed blocked: DATABASE_URL must point to a local database.";
  }
  return null;
}

export function assertDemoSeedTarget(
  env: Record<string, string | undefined> = process.env,
) {
  const error = validateDemoSeedTarget(env);
  if (error) throw new Error(error);
}
