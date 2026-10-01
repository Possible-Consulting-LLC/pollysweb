import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getLegalDoc } from "@/lib/content/legal";
import LegalDocPage from "./../[slug]/page";

type SearchParams = { code?: string };

/** Static route segment override: the Facebook data-deletion flow links
 * keepers here with ?code=<confirmation code> to check request status, so
 * this page layers the receipt lookup on top of the shared doc layout. */
export default async function DataDeletionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const doc = getLegalDoc("data-deletion");
  if (!doc) notFound();
  const { code } = await searchParams;

  let receipt: { status: string } | null = null;
  let unavailable = false;
  if (code && /^[a-f0-9]{48}$/.test(code)) {
    try {
      receipt = await prisma.facebookDeletionRequest.findUnique({
        where: { confirmationCode: code },
        select: { status: true },
      });
    } catch {
      unavailable = true;
    }
  }

  return (
    <>
      {code ? (
        <section role="status" className="mx-auto w-full max-w-6xl px-5 pt-6 sm:px-8">
          <div className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-6 shadow-[0_8px_30px_var(--shadow)]">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--midnight)]">
              {receipt?.status === "completed"
                ? "Deletion completed"
                : receipt
                  ? "Request received"
                  : unavailable
                    ? "Status temporarily unavailable"
                    : "Request not found"}
            </h2>
            {receipt?.status === "completed" ? (
              <p className="mt-2 text-[var(--midnight)]/70">
                The Facebook-provided data covered by this request has been removed. Your independently entered
                spoods, photos, and care history were retained.
              </p>
            ) : receipt ? (
              <div className="mt-2 space-y-2 text-[var(--midnight)]/70">
                <p>
                  Your request is awaiting review. It has not been marked completed. We will remove
                  Facebook-provided information while preserving your independently entered spoods, photos, and
                  care history.
                </p>
                {receipt.status === "needs_sign_in_method" ? (
                  <p>
                    Facebook was your only usable sign-in method when this request arrived. Connect another method
                    in <Link href="/settings" className="font-semibold text-[var(--plum)] underline">Settings</Link>,
                    or contact support for help establishing access, before the connection can be removed.
                  </p>
                ) : null}
                <p>
                  Contact{" "}
                  <a href="mailto:support@pollysweb.com" className="font-semibold text-[var(--plum)] underline">
                    support@pollysweb.com
                  </a>{" "}
                  with your confirmation code for assistance. Keep this status link private.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-[var(--midnight)]/70">
                {unavailable
                  ? "Please try again later."
                  : "Check your confirmation link, or contact support with the confirmation code Facebook supplied."}
              </p>
            )}
          </div>
        </section>
      ) : null}
      <LegalDocPage params={Promise.resolve({ slug: "data-deletion" })} />
    </>
  );
}