import assert from "node:assert/strict";
import { it } from "node:test";
import { GET } from "../app/robots.txt/route";

const TRACKED_ENV = ["AUTH_URL", "NEXTAUTH_URL", "SPOODLY_ENV", "VERCEL_PROJECT_ID"] as const;

async function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<void> | void,
) {
  const saved: Record<string, string | undefined> = {};
  for (const key of TRACKED_ENV) {
    saved[key] = process.env[key];
  }
  try {
    for (const key of TRACKED_ENV) {
      if (key in overrides) {
        const value = overrides[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      } else {
        delete process.env[key];
      }
    }
    await fn();
  } finally {
    for (const key of TRACKED_ENV) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

async function assertDisallowAll(response: Response, message?: string) {
  assert.equal(await response.text(), "User-agent: *\nDisallow: /\n", message);
}

async function assertPublicRules(response: Response) {
  const body = await response.text();
  assert.match(body, /^Allow: \/$/m);
  assert.match(body, /^Disallow: \/spoods$/m);
  assert.match(body, /^Disallow: \/api\/$/m);
  assert.match(body, /^Allow: \/api\/brand\/$/m);
  assert.equal(response.headers.get("Content-Type"), "text/plain; charset=utf-8");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
}

it("disallows all crawling on staging even when host matches canonical origin", async () => {
  await withEnv({ SPOODLY_ENV: "staging", AUTH_URL: "https://staging.example" }, async () => {
    for (const host of ["staging.example", "spoodly-space-staging.vercel.app", "localhost:43123"]) {
      const response = GET(new Request(`https://${host}/robots.txt`));
      await assertDisallowAll(response, host);
    }
  });
});

it("disallows all crawling on staging identified via VERCEL_PROJECT_ID", async () => {
  await withEnv(
    {
      SPOODLY_ENV: "production",
      VERCEL_PROJECT_ID: "prj_WrjgdWSnmp1RV5C0qz9vPckFj2pO",
      AUTH_URL: "https://staging.example",
    },
    async () => {
      const response = GET(new Request("https://staging.example/robots.txt"));
      await assertDisallowAll(response);
    },
  );
});

it("allows public crawling for canonical apex and www twin", async () => {
  await withEnv(
    {
      SPOODLY_ENV: "production",
      VERCEL_PROJECT_ID: undefined,
      AUTH_URL: "https://example.com",
    },
    async () => {
      for (const host of ["example.com", "www.example.com"]) {
        const response = GET(new Request(`https://${host}/robots.txt`));
        await assertPublicRules(response);
      }
    },
  );
});

it("allows public crawling when origin is configured via NEXTAUTH_URL fallback", async () => {
  await withEnv(
    {
      SPOODLY_ENV: "production",
      AUTH_URL: undefined,
      NEXTAUTH_URL: "https://example.com",
      VERCEL_PROJECT_ID: undefined,
    },
    async () => {
      const response = GET(new Request("https://example.com/robots.txt"));
      await assertPublicRules(response);
    },
  );
});

it("disallows crawling on preview or unknown hosts on public deployment", async () => {
  await withEnv(
    {
      SPOODLY_ENV: "production",
      AUTH_URL: "https://example.com",
      VERCEL_PROJECT_ID: undefined,
    },
    async () => {
      const response = GET(new Request("https://preview.vercel.app/robots.txt"));
      await assertDisallowAll(response);
    },
  );
});

it("disallows crawling when canonical origin is missing", async () => {
  await withEnv(
    {
      SPOODLY_ENV: "production",
      AUTH_URL: undefined,
      NEXTAUTH_URL: undefined,
      VERCEL_PROJECT_ID: undefined,
    },
    async () => {
      const response = GET(new Request("https://example.com/robots.txt"));
      await assertDisallowAll(response);
    },
  );
});

it("disallows crawling when canonical origin is malformed", async () => {
  await withEnv(
    {
      SPOODLY_ENV: "production",
      AUTH_URL: "not a url",
      VERCEL_PROJECT_ID: undefined,
    },
    async () => {
      const response = GET(new Request("https://example.com/robots.txt"));
      await assertDisallowAll(response);
    },
  );
});
