"use client";

import { MutationForm } from '@/components/mutation-form';
import { MutationContextInput } from '@/components/mutation-context';
import type { SocialProviderId } from "@/lib/social-auth";
import { Button } from "@/components/ui/button";

const providerNames: Record<SocialProviderId, string> = {
  google: "Google",
  apple: "Apple",
  facebook: "Facebook",
};

export function SocialButtons({
  providers,
  mode,
  action,
}: {
  providers: SocialProviderId[];
  mode: "continue" | "link";
  action: (formData: FormData) => Promise<void | { error: string }>;
}) {
  if (providers.length === 0) return null;

  return (
    <div className="mt-5 space-y-3">
      {mode === "continue" ? (
        <div className="flex items-center gap-3 text-xs text-[var(--midnight)]/70">
          <span className="h-px flex-1 bg-[var(--plum)]/15" aria-hidden="true" />
          <span>Or continue with</span>
          <span className="h-px flex-1 bg-[var(--plum)]/15" aria-hidden="true" />
        </div>
      ) : null}
      <div className="grid gap-2">
        {providers.map((provider) => (
          <MutationForm key={provider} action={action}><MutationContextInput />
            <Button
              type="submit"
              name="provider"
              value={provider}
              variant="soft"
              size="lg"
              className="w-full"
            >
              {mode === "link" ? "Connect" : "Continue with"} {providerNames[provider]}
            </Button>
          </MutationForm>
        ))}
      </div>
    </div>
  );
}
