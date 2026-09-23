# Social disconnect and Facebook deletion requests — September 20, 2026

## Keeper-facing behavior

Settings → Sign-in methods offers Disconnect for Google, Facebook, and Apple when configured. A keeper must retain another linked/configured provider, or a password with a verified email address. A temporarily usable unverified password does not count as a durable fallback. Multiple links to the same provider do not count as separate fallback methods.

The action requires a current session, then password confirmation for password accounts or social reauthentication within five minutes for social-only accounts. Inside a transaction it locks the keeper row, checks the session credential fingerprint again, re-reads linked methods, and refuses the last-method removal. The delete is restricted to the signed-in keeper and chosen provider. All sessions and pending credential-bound email changes are invalidated after disconnection. Spoods, photos, care events, and billing are untouched.

Disconnecting removes the local identity link. It is not a full account deletion or remote consent-revocation operation. OAuth tokens are not persisted by the current providers; users can also revoke consent through their Google/Facebook account settings.

## Facebook dashboard configuration (staging only)

Data deletion callback URL:

`https://staging.spoodlyspace.com/api/facebook/data-deletion`

Public instructions/status page:

`https://staging.spoodlyspace.com/data-deletion`

Do not use the instructions page in a callback-only field. The callback accepts form-encoded POSTs containing `signed_request`, validates HMAC-SHA256 using `AUTH_FACEBOOK_SECRET`, and returns JSON with `url` and `confirmation_code`. Confirm the configured Meta app ID/secret belong to the same staging app sending requests. The HTTPS status-link origin comes from `EMAIL_VERIFICATION_ORIGIN`, falling back to `AUTH_URL`; request headers never determine it. Facebook must be able to reach these routes without a Vercel login.

Google web sign-in does not use this Facebook callback. Keep its OAuth redirect URI separate; Google documents access revocation at https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke.

## Important: deletion is a reviewed workflow

The callback **records a request; it does not claim all Facebook-provided data was automatically erased**. Older User records have no per-field provenance for imported names, email addresses, or profile images. Automatically clearing those fields could destroy independently supplied keeper data or remove their remaining way to sign in.

`FacebookDeletionRequest` contains an opaque confirmation code, hashed Facebook subject/request identifiers, optional internal keeper ID, timestamps, and status. No raw signed payload, Facebook ID, access token, email, name, or photo is stored in the receipt. Identical callbacks return the original receipt, including its status. Unknown identities also receive a pending receipt, not a false deletion-completed response.

- `pending_review`: received and awaiting an operator's provider-data review.
- `needs_sign_in_method`: the linked keeper lacked another usable method at receipt time. No connection is removed. Help them establish another method before disconnecting. Facebook can revoke its own consent independently; this app cannot stop Facebook doing so.
- `completed`: set only after a reviewer has actually removed the Facebook-provided information covered by the request.

There is no automated worker, operator email notification, or admin completion UI in this change. Operators must check the request ledger through authorized database tooling and process requests; merely configuring the callback is not a complete deletion operation. Do not leave this queue unattended or represent pending requests as fulfilled.

### Operator procedure

1. Review non-completed ledger rows, oldest first. Use internal keeper ID where present; request proof of ownership through support when the mapping is missing or uncertain. Never publish account information on the public status page.
2. Verify another usable sign-in method now exists; the receipt's status is a snapshot, not a current authorization check. Where Facebook was the sole method and consent is already revoked, assist with independently verified account recovery before removing the link.
3. Determine which profile fields were supplied by Facebook. Independently verify/adopt the email needed for continued account access. Resolve unclear provenance with the keeper rather than guessing. Do not delete independently entered spoods, photos, history, or the account itself.
4. Remove the Facebook identity link and any Facebook-supplied fields/tokens identified by the review. Use the same transactional last-method/session-invalidation protections as `disconnectProvider`; do not bypass them with an unguarded Account deletion.
5. Only after actual removal, update that exact receipt to `completed` with `completedAt`. Preserve the opaque receipt for status checks. Remove obsolete receipts under the operator's retention policy; they contain internal lookup identifiers and are not anonymous analytics.

No production database work is authorized by this document. Production promotion and any production processing require separate authorization.

## Schema and verification

Additive migration: `20260920160000_facebook_deletion_requests`. Creates one server-only table with RLS enabled and grants revoked from PUBLIC/anon/authenticated. Deleting a keeper nulls the optional receipt relationship. Existing care/account data is not migrated or removed; rolling back code can leave this table in place.

- Unit tests cover remaining-method policy, reauthentication expiry, signature validation, malicious origins, duplicate callbacks, invalid signatures, and database failure responses.
- `scripts/staging-social-disconnect-check.ts` uses disposable fixtures only and verifies concurrent removals, session revocation, preserved care data, and callback receipts. It refuses non-staging databases and cleans up its own exact fixture.

Sources: `src/lib/social-disconnect.ts`, `src/lib/social-disconnect-policy.ts`, `src/app/actions/disconnect-provider.ts`, `src/lib/facebook-deletion.ts`, `src/app/api/facebook/data-deletion/route.ts`, `src/app/data-deletion/page.tsx`.
