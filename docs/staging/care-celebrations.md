# Automatic care progress and celebrations — September 20, 2026

Today's feeding attempts, hydration records, general observations, and body-condition observations automatically review the corresponding eligible spood. The keeper's saved timezone determines today. Backdated records do not create today's care star.

A care star requires every eligible active spood to be reviewed and all due feeding/hydration addressed or explicitly deferred. A feeding attempt counts even if prey was refused, avoiding pressure to feed again. Manual check-ins and deferrals remain available and can be saved partially. Existing free-plan read-only rules and memorial exclusions remain in force.

`CareCheckin` saves manual progress; automatic progress is derived from care records. `CelebratedReward` tracks reward keys per keeper and prevents repeated notifications. Existing rewards are baselined before the keeper's first mutation after the update. `CareDay` keeps its unique keeper/date constraint. The additive migration `20260920120000_care_celebrations` creates only the two new tables with RLS enabled and Data API access revoked. Applied only through the guarded staging entry point to Supabase `nfdecdylxcmuypxodppe`.

Successful actions trigger a small confetti burst and save confirmation. A newly completed day shows an animated star and streak message; newly earned badges follow using the same artwork as the gallery. Dialogs support keyboard dismissal and reduced-motion settings. Reward-processing failures do not turn a successfully saved care record into a failed save.

Validation:
- 353 unit/regression tests passed.
- TypeScript and targeted ESLint passed.
- Guarded staging integration verifies multi-spood progress, backdated logs, body observations, concurrent star/badge deduplication, and repeated saves; only its disposable account is removed afterward.
- Local Chromium validates save → star → badge order, Escape dismissal, and reduced-motion behavior.
- Live staging browser check using a disposable account verifies one of two spoods remains partial, second hydration earns the star and First Spark, a new observation earns Sharp Eyes, and refresh does not replay rewards.

No production database access, production-site deployment, seed command, or main-branch commit was performed.

## Subsequent correction policy

History edits/deletions now withdraw incomplete care days and no-longer-qualified badges. Retained snapshots allow restoration; withdrawn badge notifications can be earned again. See [Badge revalidation](badge-revalidation.md), including the limitations of reconstructing legacy care settings.
