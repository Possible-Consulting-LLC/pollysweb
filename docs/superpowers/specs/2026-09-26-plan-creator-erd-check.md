# ERD vs. Design Spec Cross-Check Report

**Date:** 2026-09-26  
**ERD:** `docs/superpowers/specs/ERD.png` — *"User-Centric Feature Gating with Plan Limits"*  
**Spec:** `docs/superpowers/specs/2026-09-26-plan-creator-feature-gating-design.md`

---

## 1. Entities & Fields Extracted from ERD

### 1.1 `users`
| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| email | VARCHAR(255) | |
| name | VARCHAR(255) | |
| status | VARCHAR(50) | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 1.2 `plans`
| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| name | VARCHAR(100) | |
| description | TEXT | |
| plan_type | VARCHAR(50) | STANDARD, CUSTOM, INTERNAL |
| max_spiders | INTEGER NULL | NULL = unlimited |
| active | BOOLEAN | |
| sort_order | INTEGER | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 1.3 `user_subscriptions`
| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| user_id | UUID | FK → users.id |
| plan_id | UUID | FK → plans.id |
| plan_billing_option_id | UUID | FK → plan_billing_options.id |
| discount_id | UUID NULL | FK → discounts.id |
| status | VARCHAR(50) | active, canceled, past_due, etc. |
| started_at | TIMESTAMP | |
| renews_at | TIMESTAMP NULL | |
| expires_at | TIMESTAMP NULL | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 1.4 `plan_billing_options`
| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| plan_id | UUID | FK → plans.id |
| interval | VARCHAR(20) | monthly, annual, etc. |
| base_price_cents | INTEGER | |
| active | BOOLEAN | |
| sort_order | INTEGER | |
| planned_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 1.5 `features`
| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| key | VARCHAR(100) | e.g. spood.limit, bulk_molt |
| name | VARCHAR(255) | |
| description | TEXT | |
| category | VARCHAR(50) | e.g. core, breeding, social |
| active | BOOLEAN | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 1.6 `feature_plan_translations`
| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| plan_id | UUID | FK → plans.id |
| feature_id | UUID | FK → features.id |
| enabled | BOOLEAN | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 1.7 `discounts`
| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| code | VARCHAR(50) | |
| name | VARCHAR(255) | |
| description | TEXT | |
| discount_type | VARCHAR(20) | percent or fixed |
| discount_percent | INTEGER NULL | |
| discount_amount_cents | INTEGER NULL | |
| starts_at | TIMESTAMP NULL | |
| ends_at | TIMESTAMP NULL | |
| max_redemptions | INTEGER NULL | |
| per_user_limit | INTEGER NULL | |
| active | BOOLEAN | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 1.8 `discount_billing_options`
| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| discount_id | UUID | FK → discounts.id |
| plan_billing_option_id | UUID | FK → plan_billing_options.id |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 1.9 `discount_redemptions`
| Field | Type | Constraints |
|-------|------|-------------|
| id | UUID | PK |
| discount_id | UUID | FK → discounts.id |
| user_subscription_id | UUID | FK → user_subscriptions.id |
| user_id | UUID | |
| redeemed_at | TIMESTAMP | |
| amount_discounted_cents | INTEGER | |
| created_at | TIMESTAMP | |

### 1.10 Relationships (from ERD)

| From | Cardinality | To | Label |
|------|-------------|-----|-------|
| users | 1 → * | user_subscriptions | has |
| plans | 1 → * | user_subscriptions | has subscriptions |
| plans | 1 → * | plan_billing_options | uses billing option |
| plans | 1 → * | feature_plan_translations | has features |
| features | 1 → * | feature_plan_translations | references |
| plan_billing_options | 1 → * | discount_billing_options | has eligible discounts |
| discounts | 1 → * | discount_billing_options | applies to |
| user_subscriptions | 1 → * | discount_redemptions | has |

### 1.11 ERD Notes / Annotations
- `max_spiders`: NULL = unlimited; otherwise integer limit.
- All app functionality is controlled via features and plan settings.
- Create custom plans to give specific features to individual users.
- Super admin controls all plan and feature settings.

---

## 2. Divergence Table

| # | Entity | Difference | ERD | Spec | Authoritative Source | Impact on Implementation |
|---|--------|-----------|-----|------|----------------------|-------------------------|
| 1 | Plan | **`public` field** | ❌ Absent | ✅ Present (boolean) | **Spec** (explicitly documents this addition at line 120) | None — intentional; spec calls out that it was not drawn but is required |
| 2 | FeatureEngagementEvent | **Entire entity absent from ERD** | ❌ Not present | ✅ Fully specified (13 fields + 6 event types) | **Spec** (line 183: *"Add an append-oriented analytics entity"*) | **Moderate** — implementer must derive this entity entirely from spec text; no ERD reference for field list or relationships. Schema and migration work for this table cannot be cross-checked against the diagram. |
| 3 | All entities | **Naming convention: snake_case vs. camelCase** | snake_case (`plan_id`, `max_spiders`) | camelCase (`planId`, `maxSpiders`) | **Either** (spec line 106: *"Prisma names should follow repository conventions, while database mappings may preserve snake_case names"*) | None — expected; implementation chooses per layer |
| 4 | users | **Entity present in ERD but not in spec's entity list** | ✅ Present | ⚠️ Not listed among the 9 spec entities | **ERD is authoritative for relationships**; users is a pre-existing table outside the scope of this feature's new schema | Low — spec references `userId` FKs implying users exists; no new fields on users are defined by either document |
| 5 | Discount, DiscountBillingOption, DiscountRedemption | **Spec defers to ERD for field detail** | Full field lists drawn | *"Implement as drawn"* (line 173) — no individual field enumeration | **ERD** (spec explicitly defers) | None — implementer reads ERD for these three entities' columns |

---

## 3. Confirmation of Known Intentional Divergences

### Divergence A — `public` field on Plan
- **Status:** ✅ **CONFIRMED** as intentional.
- **Evidence:** Spec line 120–121: *"`public` is required by the approved plan-creator behavior even though it was not drawn in the supplied ERD."*
- **Verdict:** Not a finding. Correctly documented by the spec.

### Divergence B — Prisma / camelCase naming vs. ERD snake_case
- **Status:** ✅ **CONFIRMED** as intentional.
- **Evidence:** Spec line 106: *"Prisma names should follow repository conventions, while database mappings may preserve snake_case names."*
- **Verdict:** Not a finding. Expected mapping-layer difference.

---

## 4. Overall Verdict

**Spec matches ERD with 1 unannotated divergence.**

The spec and ERD are **well-aligned** across all 8 shared entities (Plan, PlanBillingOption, Feature, FeaturePlanTranslation, UserSubscription, Discount, DiscountBillingOption, DiscountRedemption). Field lists, types, nullability, and relationship cardinalities are consistent. The two known intentional divergences (`public` field and naming convention) are correctly acknowledged in the spec text.

**One noteworthy item:** `FeatureEngagementEvent` is fully specified in the spec but has **no representation whatsoever in the ERD**. The spec's language ("*Add* an append-oriented analytics entity") signals this is deliberate — it is a new addition beyond what the ERD captures. Implementers must rely solely on the spec prose (lines 182–207) for this entity's schema. This does not represent an error in either artifact, but it is the single largest gap between the two documents.

**No fields present in the ERD are missing from the spec.**  
**No relationship cardinalities disagree.**  
**No entity exists in one document but not the other** (excluding the intentional FeatureEngagementEvent addition and the pre-existing `users` table).
