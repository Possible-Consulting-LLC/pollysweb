# Social sign-in for keeper accounts

## Status and scope

The keeper approved Google, Apple, and Facebook sign-in/account creation for Spoodly Space. Instagram is excluded: Meta's current Instagram Login API is limited to professional accounts and is not a general consumer sign-in option. This feature will be built and tested in the isolated staging worktree, staging Supabase project, and staging Vercel project. It must not touch the production database, production Vercel project, or `main` branch. No seed data is required. The separate proposal to strengthen password requirements is outside this feature.

## Keeper experience

- Add **Continue with Google**, **Continue with Apple**, and **Continue with Facebook** to both the sign-in and account-creation pages, separated visually from the email/password form. Keep email/password available. A provider button appears only when its credentials are configured for that environment.
- The first successful provider sign-in creates one Free keeper account and signs the keeper in. Returning with the same provider identity signs in to that account; it never creates a second keeper.
- In Settings, a signed-in keeper can connect an additional provider to the current account. The UI lists connected providers and explains that connecting one lets the keeper use it to reach the same spoods and subscription. Do not unlink the last usable sign-in method. Account linking requires a valid current session, not just a matching email address.
- If an unauthenticated provider sign-in returns an email already owned by another keeper but that provider identity is not linked, do not merge or create an account. Show a friendly message to sign in using the existing method, then connect the provider in Settings. Do not expose whether an arbitrary email belongs to a keeper through a separate public lookup.
- If a provider supplies no email for a new account, stop with an actionable message to make an email available through that provider or use email/password. A provider already linked by its stable provider ID may sign in even if a later response omits the email. Apple's private relay email is accepted as an email address and is never assumed to match a keeper's other address.
- Provider cancellation, declined permission, and configuration errors return to a clear sign-in message without creating a partial account. Buttons should have accessible names, visible focus, and text labels, not logos alone.

## Identity and data model

Use the app's existing Auth.js installation with its Prisma adapter and existing JWT session strategy. Add Auth.js-compatible provider-account storage with a unique `(provider, providerAccountId)` key and a user relation. Extend the existing `User` schema for adapter compatibility while retaining its current ID, email uniqueness, spoods, care history, settings, and Stripe fields. Make `passwordHash` nullable for provider-only accounts; never put a fake or shared password in that field. Social-only accounts cannot use password sign-in until a separate, explicitly designed password-creation flow exists.

Auth.js's current OAuth callback behavior supports this policy: an authenticated session can link an unused provider identity, while a same-email OAuth sign-in without a session is rejected rather than auto-linked. Do not enable `allowDangerousEmailAccountLinking`. Prefer the adapter's supported linking flow rather than a second custom identity table or manual insertion during a callback. Keep transactional uniqueness constraints so concurrent callbacks cannot attach a provider identity to two keepers or create duplicate emails.

Request only the basic identity and email scopes needed for sign-in. Do not request social graph, media, posting, or marketing permissions. Store no provider credentials in the browser, application logs, or source control. Provider client IDs and secrets live in the appropriate Vercel environment variables. Avoid retaining provider access or refresh tokens beyond what the sign-in flow requires; document any fields the adapter must persist.

## Sessions and password compatibility

The app currently fingerprints `passwordHash` in each JWT and checks it against the database on every request, revoking sessions after a password change. Adapt that check to account for a nullable hash without weakening revocation for password accounts. A provider-only account gets a per-account session credential version (or equivalent nonshared server-generated value) so sessions remain tied to that keeper and can be revoked; the implementation must not use a constant shared across all provider-only accounts. Keep existing password users and their stored bcrypt hashes valid. Signing in with a newly linked provider returns the existing `User.id`, so all spoods, history, badges, settings, and billing remain attached to the same keeper.

Password-change UI and action must handle provider-only accounts explicitly: do not request a nonexistent current password or call bcrypt with a null hash. In this first version, show a clear explanation and keep provider-only password creation out of scope; they retain provider sign-in. A password account may still change its password normally and must continue to invalidate prior sessions.

## Provider setup and rollout

- Register separate OAuth clients/apps and redirect URLs for the stable staging domain before enabling any staging button. Use Auth.js callback paths `/api/auth/callback/google`, `/api/auth/callback/apple`, and `/api/auth/callback/facebook`. Keep staging and future production credentials distinct.
- Google requires OAuth client credentials and a consent-screen configuration. Apple web sign-in requires an Apple Developer App ID, Services ID, private key/client secret, and registered website/return URL. Facebook requires a Meta developer app with Facebook Login and the correct web redirect URL. These console prerequisites may require keeper account access and provider review; the application must not show an unusable button while setup is incomplete.
- Configure one provider at a time on staging and exercise new-account sign-in, returning sign-in, and existing-account linking before enabling the next. No production deployment or production OAuth application changes are part of this staging release.

## Verification

- Pure tests cover provider identity resolution, same-email collision, missing email, duplicate callback attempts, link-to-current-user rules, and refusal to attach an already-linked provider to another keeper.
- Session tests cover password-account legacy login, social-only sessions, password-change revocation, account deletion, and provider linking without changing the keeper ID.
- Run lint, type checking, full tests, and a local build. Apply any schema migration only to the explicitly identified staging Supabase database after reviewing its target; never use production credentials or run seed commands.
- On the staging site, verify the full OAuth round trip for each configured provider, including cancellation, Apple private relay where available, returning users, email collisions, and responsive keyboard access. Inspect Vercel logs for failures without logging provider tokens or user secrets.

## Design decisions and limits

This uses Auth.js's supported adapter behavior instead of building a parallel login system. It preserves one keeper record across sign-in methods and deliberately refuses email-only auto-linking. Instagram, social posting, contact import, forced migration of existing passwords, passwordless email, and provider-only password creation are outside the first release.

## References

- Auth.js provider setup: https://authjs.dev/getting-started/providers/google , https://authjs.dev/getting-started/providers/apple , https://authjs.dev/getting-started/providers/facebook
- Auth.js Prisma adapter: https://authjs.dev/getting-started/adapters/prisma
- Apple web requirements: https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web
- Meta Instagram Login scope: https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login
