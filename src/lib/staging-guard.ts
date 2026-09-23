type Environment = Record<string, string | undefined>;

const STAGING_REF = "nfdecdylxcmuypxodppe";

export function isStaging(env: Environment = process.env): boolean {
  return env.SPOODLY_ENV === "staging" ||
    env.VERCEL_PROJECT_ID === "prj_WrjgdWSnmp1RV5C0qz9vPckFj2pO";
}

/** Never include configuration values or parser errors in diagnostics. */
export function assertStagingEnvironment(env: Environment = process.env): void {
  if (!isStaging(env)) return;

  function invalid(field: string): never {
    throw new Error(`Unsafe staging configuration: check ${field}.`);
  }

  function parse(field: string): URL {
    try {
      return new URL(env[field] || "");
    } catch {
      return invalid(field);
    }
  }

  for (const field of ["DATABASE_URL", "DIRECT_URL"]) {
    const url = parse(field);
    let username: string;
    try {
      username = decodeURIComponent(url.username);
    } catch {
      return invalid(field);
    }
    const direct = url.hostname === `db.${STAGING_REF}.supabase.co` && username === "postgres";
    const pooled = url.hostname === "aws-0-us-west-2.pooler.supabase.com" && username === `postgres.${STAGING_REF}`;
    const allowedOptions = new Set(["pgbouncer", "connection_limit", "pool_timeout", "connect_timeout", "sslmode", "schema", "statement_cache_size"]);
    if (!(["postgres:", "postgresql:"].includes(url.protocol)) ||
        !(direct || pooled) || !url.password || url.pathname !== "/postgres" || url.hash ||
        (url.port && !(direct ? ["5432"] : ["5432", "6543"]).includes(url.port)) ||
        [...url.searchParams.keys()].some((key) => !allowedOptions.has(key))) {
      invalid(field);
    }
  }

  const urlFields = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"];
  if (!urlFields.some((field) => env[field]?.trim())) invalid("SUPABASE_URL");
  for (const field of urlFields) {
    if (!env[field]?.trim()) continue;
    const url = parse(field);
    if (url.protocol !== "https:" || url.hostname !== `${STAGING_REF}.supabase.co` ||
        url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      invalid(field);
    }
  }

  // Storage is optional initially. Validate every supplied key, including fallbacks.
  for (const field of ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
    const key = env[field]?.trim();
    if (!key) continue;
    if (key.startsWith("eyJ")) {
      try {
        const parts = key.split(".");
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
        if (parts.length !== 3 || payload.ref !== STAGING_REF) invalid(field);
      } catch {
        invalid(field);
      }
    } else if (!/^sb_(secret|publishable)_[A-Za-z0-9_-]+$/.test(key)) {
      invalid(field);
    }
  }

  for (const field of Object.keys(env)) {
    if ((field.startsWith("STRIPE_") || field.startsWith("NEXT_PUBLIC_STRIPE_") || field === "RESEND_API_KEY") && env[field]?.trim()) {
      invalid(field);
    }
  }
  if (env.EMAIL_RESEND_API_KEY?.trim()) {
    if (!env.EMAIL_FROM_EMAIL?.trim()) invalid("EMAIL_FROM_EMAIL");
    const recipients = env.EMAIL_ALLOWED_RECIPIENTS?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
    if (recipients.length === 0 || recipients.some((value) => !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(value))) invalid("EMAIL_ALLOWED_RECIPIENTS");
    if (env.FEEDBACK_TO_EMAIL !== undefined && !recipients.some((value) => value.toLowerCase() === env.FEEDBACK_TO_EMAIL?.trim().toLowerCase())) invalid("FEEDBACK_TO_EMAIL");
    const origin = parse("AUTH_URL");
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) invalid("AUTH_URL");
    if (env.EMAIL_VERIFICATION_ORIGIN !== undefined) {
      const emailOrigin = parse("EMAIL_VERIFICATION_ORIGIN");
      if (emailOrigin.protocol !== "https:" || emailOrigin.username || emailOrigin.password || emailOrigin.pathname !== "/" || emailOrigin.search || emailOrigin.hash) invalid("EMAIL_VERIFICATION_ORIGIN");
    }
  }
}
