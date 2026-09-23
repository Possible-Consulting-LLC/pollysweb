# Admin implementation entry-point inventory

Status: baseline inventory for implementation, not a claim that guards are installed. Update with concrete tests as Tasks 6–9 land.

| Surface | Existing boundary | Required integration |
| --- | --- | --- |
| App pages (`src/app/(app)`) | `requireUser` in layout/pages | Effective demo identity; maintenance read gate; do not rely only on layout caching |
| `/api/photos` | Calls `auth()` directly; owner queries | Resolve effective identity and maintenance; retain private/no-store responses |
| Registration/verification actions | Public actions in `actions/auth.ts` | Ordinary operations gated during maintenance; auth-only super-admin entry remains possible |
| Auth.js route/password login/social callbacks | `src/lib/auth.ts` | Live suspension/deletion check; ordinary completed login cannot grant app access in maintenance |
| Create spood | `getActionUser`, slot transaction | Form context and late write guard; demo plan in slot limit |
| Settings/password/email/provider changes | Mixed `requireUser`/`getActionUser` and public confirmation | Reject Test-as identity changes; preserve owner self-preferences; maintenance gate and late mutation check |
| Care events/about/habitat | `getCareWriteUser`, ownership and entitlement | Effective target + form context; maintenance before database writes |
| Photo upload/profile/delete | Habitat actions plus remote Storage work | Recheck before attaching object; cleanup only new owned unattached object if blocked |
| Activity edit/delete | Owned event query, history mutation transactions | Late write guard and test context, including dependent summary/reward writes |
| Manual care check-in | `actions/constellation.ts` | Effective target/context and late write guard |
| Billing checkout/portal | Session plus billing User lock | Reject demo/deleting/suspended/Test-as; maintenance; coordinate demo designation with customer/checkout creation |
| Feedback | Authenticated server action with external email | Maintenance and test context; retain existing recipient/sender controls |
| Stripe webhook | Signature validation, live reconciliation and User lock | Remain reachable; reconcile safely or retryable failure; never silently process around demo/deletion policy |
| Facebook deletion callback | Signed payload validation and receipt upsert | Remain reachable; preserve idempotent receipt and reviewed provider-only handling |
| Billing cron | Cron authentication | Skip with explicit maintenance status; resume reconciliation later |
| Health | Public minimal endpoint | No account/settings leakage; truthful availability |
| Brand mark/hero, static assets | Public static imagery | Remain available for maintenance/login page |
| Privacy/terms/deletion status | Public pages | Remain reachable without account data disclosure |
| New admin routes/actions | To be introduced | Live actor/target authorization; no use of effective demo identity for admin access |
| New site-status route | To be introduced | Minimal uncached DTO: state/time/message; no privileged IDs |

## Integration details found during baseline inspection

- `getRequestSession` is request-cached. Late write checks must query current policy rather than assume the layout/session check remains current.
- `history-mutations.ts` locks Spider/Enclosure while billing locks User. Define a consistent lock order when adding owner/deleting checks; avoid acquiring User after a conflicting Spider lock in other paths.
- `care-revalidation-data.ts` and `care-celebrations.ts` perform writes on some care reads. Maintenance enforcement must cover those callers, not just form submissions.
- `TimezoneSync` writes the browser timezone cookie. Administrator reporting must prefer the explicitly saved User timezone and must not overwrite it with this cookie.
- Existing checkout creates Stripe objects while holding a User transaction lock. A database rollback cannot roll back Stripe; demo designation must account for uncertain external operations and pending checkout, not only local subscription fields.
- Photo, activity and feedback controls include server actions taking arguments directly rather than FormData. Task 6 must carry mutation context through those callers as well as HTML forms.
- Concrete direct-argument callers include `components/spoods/photo-gallery.tsx` (`deleteSpiderPhoto`) and `components/billing/checkout-buttons.tsx` (`openBillingPortalAction`). The Settings form binds `updateSettingsAction` directly in a Server Component.
- `getCareWriteUser` currently takes no submitted context. `resolveActivityDateTime` can call `rememberUserTimeZone`, which writes a preference before the final care-event write; context and maintenance checks must precede that helper too.

No production database was inspected to produce this inventory.

## Task 6 implemented boundary (unapplied staging migration)

- `raw-session.ts` holds the real Auth.js session. `admin/test-session-store.ts` resolves actor/effective identity, validates the live owner binding and both accounts, and stores only a random token hash. Tests cover direct demo login separately from Test-as.
- `mutation-boundary.ts` admits all exported data/identity/billing/admin actions before their helpers run. Root rendering supplies an HMAC context via `MutationContextProvider`; forms carry it through `MutationContextInput`, and direct callers pass it explicitly. The token reveals no credential fingerprint, actor ID, or target ID. Starting/stopping rotates a separate User context epoch without changing the real login credential.
- The admission check is the linearization point: an admitted action keeps its captured effective target in AsyncLocalStorage. Stop/revocation blocks newly admitted actions; it cannot redirect an in-flight action to the actor's account. Task 8 must add maintenance checks/drain behavior at this boundary and the existing late-write guards.
- Stop and logout are deliberate recovery exceptions. Stop only terminates testing. Logout exits the real browser session and revokes actor test sessions, including direct Auth.js signout events; neither assigns stale demo form data to an account.
- `/api/photos`, ordinary app account reads, and root theme use effective identity. Administrative reads/authorization remain real-actor-only and reject a test cookie. Identity/provider/billing actions and Auth.js signin callbacks reject testing.
- `derived-mutation.ts` captures effective identity for care-day reconciliation during reads. Only an actual changed row receives a derived mutation audit; unchanged reads produce no mutation event. Reward helpers called from admitted actions remain scoped to the captured target and covered by the parent attempt/success audit.
- Session start/end/expiry/revocation and safe mutation attempt/success metadata are audited. Terminal transitions use conditional updates in the same transaction as audit, and account deletion cleans exact actor/target sessions.
- Verification: session core, immutable admission, stale form/direct caller coverage, safe photo/theme entry points, actual derived-change auditing, and target-suspension actor-session preservation tests. Two-tab browser and OAuth/cookie acceptance remain deferred until the separately approved staging migration and deployment.

## Task 8 server enforcement (unapplied staging migration)

Every check reads `SiteSettings` uncached and derives mode from the server clock. `maintenance-access.ts` rechecks the real actor, immutable owner binding, current credential fingerprint and (when testing) the live test row/target. It never changes the captured effective target. The public status DTO has only `mode`, `serverTime`, `deadline`, `announcementEnabled`, and the enabled `announcement` text.

| Concrete entry point | Installed boundary / deliberate exception |
| --- | --- |
| `/`, `(app)/layout`, home, activity, constellation, settings, upgrade, spoods/list/new/detail/story | Uncached `getSessionUser`/`requireUser` gate, including when the underlying session is request-cached; `/today` only redirects. Auth/state/data lookup failure redirects to static `/maintenance`. |
| Root theme and Test-as banner | Guard before personalized theme; unavailable auth/theme falls back without blocking maintenance/legal/login. No ordinary bypass from cached theme/session. |
| Every `/admin` page; admin account/demo/deletion/audit/reporting actions | `requireAdminActor` read gate and `withMutation` admission; `withAdminMutation` and `withAdminReauthentication` recheck inside the same transaction before returning. Admins blocked; live super admins pass. |
| `actions/about.ts`, `care-events.ts`, `activity.ts`, `care-habitat.ts`, `constellation.ts`, data/settings/password parts of `auth.ts` | Context admission followed by explicit `maintenanceTransaction`: gate on the transaction connection before work and immediately before return/commit. Settings session checks inside an admitted action propagate typed maintenance denial; direct page checks retain fallback redirects. Related photo/profile and history/summary changes are atomic. No broad Prisma interception. |
| `care-shared.ts` timezone discovery | Separate guarded transaction before the primary event, explicitly does not mark a care event committed. |
| `care-revalidation-data.ts`, `derived-mutation.ts`, `care-celebrations.ts` | Actual derived writes pass their captured identity into fresh pre/post policy checks, including live Test-as expiry/revocation checks without action context. Only completion of a confirmed primary save gets an internal account-scoped drain context for care stars/rewards; fresh read reconciliation cannot acquire this exception. |
| `saveImageUpload`, photo attachment, create-spood attachment | Guard durable reservation and remote admission; reservation never grants attachment permission. Attachment uses fresh guarded transaction. Late rejection invokes strict unattached-object cleanup; attached/unsettled/unverifiable objects retain the durable ledger. |
| `actions/auth.ts` signup/resend/verification; `email-challenge.ts`; email-change and disconnect-provider actions | Public/context admission plus guarded transactions. Verified credential rotations take the actor User lock and recognize only the same transaction's own credential change at final maintenance check; role/owner/active state still checked. |
| Verification page/challenge lookup | Read gate; static fallback on unavailable gate. Confirmation operations remain guarded public actions. |
| `/login`; `loginAction`; `startSocialSignIn`; Auth.js route | Minimal login initiation remains reachable. After credential/provider verification, live maintenance login policy rejects ordinary/admin/direct-demo completion; OAuth adapter createUser/updateUser/linkAccount check before work and before commit within a ReadCommitted transaction on the same connection; fresh JWT completion rechecks. Existing session parsing is not recursively gated. |
| `stopTestSessionAction`, `logoutAction`, direct Auth.js signout, `/api/auth/clear-stale`, `/testing-ended` | Explicit auth/context recovery exceptions. Expiry/end/revocation bookkeeping and safe audit may drain; these never write keeper care data. |
| Billing actions / `billing-service-core.ts` | `withMutation`, then live admission at each User-locked phase and immediately before Stripe create. Once remote work is admitted, its acknowledgment drains; a blocked later phase retains the persisted checkout intent. |
| Feedback / verification and email-change delivery | Fresh gate immediately before external send. Once admitted, acknowledgment and dependent notices drain; no after-send cutoff error falsely invites another send. |
| `/api/photos` | Effective identity + fresh read gate at entry and before download. Failure returns 503, `Retry-After: 60`, private/no-store; no data download after denial. |
| `/api/stripe/webhook` | Existing configuration/signature checks first. Valid signed callbacks during active/unavailable maintenance get retryable 503; no `{received:true}` for skipped processing. Already admitted reconciliation drains. |
| `/api/facebook/data-deletion` | Existing signed payload/type/size checks first, then maintenance gate and recheck before receipt write. Deferred callbacks get 503 without confirmation code; legal/status page remains reachable. |
| `/api/cron/reconcile-billing` | Existing staging disable + bearer authentication first, then maintenance admission; each customer phase rechecks. Active maintenance pauses new phases. |
| `/api/site-status`, `/maintenance` | Public explicit allowlist. Status uncached, no session lookup and no privileged IDs; missing/unavailable state gives 503/no-store/Retry-After. Maintenance page has no state or auth dependency. |
| `/api/health` | Coarse `{ok}` only, no-store; state outage/active maintenance is unavailable. |
| `/privacy`, `/terms`, `/data-deletion`, brand mark/hero, robots, bundled static assets | Explicit public allowlist. Deletion status exposes only existing opaque-code receipt status; lookup failure remains its existing unavailable response. |

Server regressions: `maintenance-policy`, `maintenance-state`, `maintenance-access`, `maintenance-write`, `maintenance-routes`, `maintenance-integration`, plus auth/session, callback, cron, billing and mutation-recovery tests. All service tests use injected fakes; no database/Storage/Stripe/mail call was made. Task 9 supplies polling, countdown/banner and interactive admin controls; it must consume the existing `MutationFailure` shape without clearing unsaved input.
