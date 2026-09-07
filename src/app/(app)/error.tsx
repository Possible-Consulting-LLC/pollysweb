"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--midnight)]">
        That page stumbled
      </h1>
      <p className="text-sm text-[var(--midnight)]/70">
        Something went wrong loading this screen. You can try again or head back
        home.
      </p>
      {error.digest ? (
        <p className="text-xs text-[var(--midnight)]/45">Ref: {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <Link href="/home">
          <Button type="button" variant="secondary">
            Back home
          </Button>
        </Link>
      </div>
    </div>
  );
}
