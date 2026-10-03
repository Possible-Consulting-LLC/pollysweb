import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { socialErrorMessage } from "./social-error";

function loginPage(signedIn: boolean) {
  const source = readFileSync(new URL("../app/(marketing)/login/page.tsx", import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: { default?: (input: { searchParams: Promise<{ error?: string }> }) => Promise<unknown> } = {};
  let redirectPath = "";
  runInNewContext(output, {
    exports, process: { env: {} },
    require: (name: string) => {
      if (name === "react/jsx-runtime") return { jsx: () => null };
      if (name === "@/components/auth/forms") return { LoginForm: () => null };
      if(name === "@/lib/admin/maintenance-access") return {allowMaintenanceLogin:async()=>true};
      if (name === "@/lib/raw-session") return { getRequestSession: async () => signedIn ? {user:{ id: "keeper-a" }} : null };
      if (name === "next/navigation") return { redirect: (path: string) => { redirectPath = path; throw new Error("REDIRECT"); } };
      if (name === "@/lib/social-auth") return { configuredSocialProviders: () => [] };
      if (name === "@/lib/social-error") return { socialErrorMessage };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return { run: (error?: string) => exports.default!({ searchParams: Promise.resolve({ error }) }), path: () => redirectPath };
}

test("signed-in OAuth errors return to Settings where linking feedback is visible", async () => {
  for (const error of ["OAuthCallbackError", "AccessDenied", "OAuthAccountNotLinked"]) {
    const page = loginPage(true);
    await assert.rejects(page.run(error), /REDIRECT/);
    assert.equal(page.path(), `/settings?error=${error}`);
  }
});

test("ordinary signed-in visits and unknown errors still go home", async () => {
  for (const error of [undefined, "<script>alert(1)</script>"]) {
    const page = loginPage(true);
    await assert.rejects(page.run(error), /REDIRECT/);
    assert.equal(page.path(), "/home");
  }
});
