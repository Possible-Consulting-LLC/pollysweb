# Spoodly Space Pricing Plans Design

Status: approved in conversation for specification. This document defines the public Pricing page and the future account-boundary contract. The current phase does not change entitlements, Stripe products, checkout, subscriptions, trials, existing plan records, or production data. Paid-plan implementation and deployment remain separately reviewed work.

## Intent

Give first-time and existing keepers a clear reason to pay even when they care for only one spood, while preserving a genuinely useful Free plan for essential daily care. Use one simple paid feature set across Basic, Pro, and Unlimited; those paid plans differ only by active-spood allowance. Leave room for future audience-specific offerings such as breeder or maker accounts without including or implying them now.

Success means a visitor can quickly understand:

1. what Free provides;
2. what a paid plan unlocks;
3. which paid plan matches the number of active spoods in their care;
4. how annual pricing and the one-time trial work; and
5. what happens to data after a downgrade.

## Plan contract

| Plan | Monthly | Annual | Active spoods | Features |
| --- | ---: | ---: | ---: | --- |
| Free | $0 | $0 | 1 | Essential care |
| Basic | $1.99 | $19.99 | 1 | Complete feature set |
| Pro | $4.99 | $49.99 | 5 | Complete feature set |
| Unlimited | $9.99 | $99.99 | Unlimited | Complete feature set |

The annual prices are presented as two months free and are roughly a 17% saving relative to twelve monthly payments. Basic is the recommended plan for most single-spood keepers. Pro and Unlimited do not receive features that Basic lacks; they purchase additional active-spood capacity.

Every account may use one no-card, three-day trial of Basic, Pro, or Unlimited. The trial does not automatically convert or charge. At expiration, the account returns to its previous plan and the downgrade behavior below applies. Trial enforcement is future implementation work; the first Pricing page describes it as coming with the paid plans.

## Free plan

Free is a lasting daily-care tool for one active spood. It includes:

- one active spood profile;
- the five supplied default portraits;
- the About fields for identity, species, dates, and notes;
- Feed, Hydrate, and Molt logging;
- current care status, last-fed and last-hydrated information, molt state, and due-care guidance; and
- visible memorialized profiles, which do not consume the active-spood allowance.

Free does not include:

- uploaded photos, event photo attachments, profile-photo uploads, or the Shooting Stars gallery;
- Observe, Play, Body Condition, or Premolt tracking;
- enclosure details or Housekeeping logs;
- the full Activity archive or editing past events;
- Spoodly Universe story timelines;
- Journey check-ins, streaks, or badges; or
- custom care intervals, themes, and other advanced personalization.

The UI should describe the paid experience positively rather than presenting Free as a page of disabled controls. Future enforcement should hide unavailable feature entry points and provide a concise upgrade explanation at relevant discovery points.

## Memorials and downgrades

Memorialized spoods remain visible on every plan and never consume an active-spood slot. On Free, their paid-only photos and detailed history remain stored but hidden like other paid data.

Downgrading never deletes customer content:

- Free and Basic expose the newest one active spood.
- Pro exposes the newest five active spoods.
- Unlimited exposes every active spood.
- Active spoods beyond the destination plan allowance remain stored but hidden until the account upgrades or frees a slot.
- On Free, existing paid-only photos, detailed history, Journey progress, and other paid records remain stored but hidden until paid access resumes.

“Newest” means the most recently created active spood by the application’s canonical creation timestamp, with a deterministic identifier tie-breaker. Memorializing a visible active spood frees a slot. Future implementation must define safe selection and transition behavior under an account-level lock so checkout, webhooks, trials, restoration, and memorialization cannot expose inconsistent allowances.

## Pricing page experience

Create a public `/pricing` page in the existing Spoodly Space visual language. Add a clear Pricing link from the public landing-page navigation and footer. Signed-in billing surfaces may link to it for plan comparison, but the current `/upgrade` checkout behavior remains unchanged in this phase.

The selected page hierarchy is “plans first”:

1. A concise hero explains that care can grow with the keeper’s constellation.
2. An accessible Monthly/Annual selector defaults to Annual and labels it “2 months free.” It changes displayed prices only; it performs no billing action.
3. Four responsive plan cards appear in Free, Basic, Pro, Unlimited order. Basic receives a restrained “Best for one spood” emphasis.
4. A full comparison section groups features into Profiles, Essential care, Complete care, Memories, Journey, and Personalization. Mobile uses readable stacked feature rows rather than a horizontally clipped desktop table.
5. A short data-safety section explains memorial slots and downgrade preservation without promising that hidden paid data is available on Free.
6. A compact FAQ answers annual billing, the no-card trial, memorials, and downgrades.
7. A final Free call to action links to `/register`; sign-in remains available for existing accounts.

During this page-only phase, paid cards display “Coming soon” rather than active checkout or trial controls. Free links to account registration. The page must not claim the four-tier billing system is purchasable until the later entitlement and Stripe work ships. Existing checkout configuration, prices, and `/upgrade` behavior are not modified by this phase.

## Accessibility and responsive behavior

- Use semantic headings, lists, and buttons/links.
- The billing-period selector must expose its selected state to assistive technology and work by keyboard.
- Do not communicate plan differences using color or checkmarks alone; pair every state with text or an accessible label.
- Preserve legible card and comparison content at the current mobile target width without horizontal page scrolling.
- Respect the existing light, dark, and system themes and focus styles.
- Price text must always state the actual billing period; annual-equivalent monthly amounts may appear only as supporting text beside the annual total.

## Content and terminology

Use “spood” and “spoods” throughout. Use “active spood” where the allowance could otherwise be confused with memorialized profiles. Describe Free as “Essential care for one spood,” Basic as “The complete experience for one spood,” Pro as “Complete care for up to five spoods,” and Unlimited as “Complete care for your whole constellation.”

Avoid “unlimited profiles” for Pro. Avoid promising future breeder or maker capabilities. Avoid implying that hidden downgrade data has been deleted or that the no-card trial will convert automatically.

## Future implementation boundary

The later implementation must replace the current binary Free/Pro entitlement with one shared resolver for Free, Basic, Pro, Unlimited, and temporary trial access. UI hiding alone is insufficient: every server action, route, upload path, history mutation, spood-slot check, demo-plan override, administrator filter, reconciliation job, Stripe webhook, checkout flow, and downgrade transition must use the same server-authoritative entitlement contract.

Future Stripe work needs separate monthly and annual prices for Basic, Pro, and Unlimited, plus migration behavior for existing Pro subscribers. The later plan must also cover demo accounts, current manually granted Pro access, billing recovery, trial eligibility, expiry, hidden-spood selection, data restoration, legal copy, and metrics. No schema or billing changes are part of the Pricing page phase.

## Verification

The Pricing page phase should include focused tests that verify:

- all four plan names, prices, active-spood allowances, and annual “two months free” message;
- the approved Free inclusions and exclusions;
- Basic is the visually and semantically recommended single-spood plan;
- paid calls to action are non-purchasing “Coming soon” states;
- Free registration and sign-in links point to existing routes;
- the period selector updates every paid price and exposes its selected state;
- the comparison remains understandable without color; and
- the page renders without horizontal overflow at the app’s narrow mobile viewport and remains readable on desktop.

Run the repository’s TypeScript, lint, test, and production build checks before presenting the page for review. Browser verification should cover the narrow mobile viewport, desktop layout, keyboard selection, and both themes. No checkout, subscription, trial, migration, or data-write test is required in this page-only phase because those behaviors are intentionally unchanged.

## Acceptance criteria

1. `/pricing` publicly presents Free, Basic, Pro, and Unlimited using the approved prices and allowances.
2. Free’s retained essentials and paid-only features match this contract exactly.
3. Basic is clearly recommended for a keeper with one active spood; Pro and Unlimited differ only in active-spood capacity.
4. Annual pricing defaults on and is described as two months free.
5. Trial and downgrade copy accurately describes no-card, non-converting access and preservation of hidden data.
6. The public page does not initiate purchases or modify the current billing system.
7. The page is accessible, responsive, theme-compatible, and linked from the public landing experience.
8. Existing billing, entitlement, and care behavior remains unchanged until the separately reviewed implementation phase.
