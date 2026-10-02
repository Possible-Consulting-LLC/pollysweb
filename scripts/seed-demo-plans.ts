// Local-review tooling: seeds the demo plan catalog (Free / Basic / Pro per the
// pricing mockup) into the DEV database ONLY. Refuses to run outside local dev
// unless DEMO_SEED is explicitly set — never target staging or production.
import { PrismaClient } from "@prisma/client";
import { assertDemoSeedTarget } from "../src/lib/seed-guard";

const prisma = new PrismaClient();

const PLAN_INPUTS = [
  {
    name: "Free",
    description: "Perfect for getting started.",
    sortOrder: 1,
    maxSpiders: 1,
    monthlyCents: 0,
    annualCents: 0,
    features: [
      "spood.create",
      "spood.about.view",
      "spood.about.edit",
      "care.log.feeding",
      "care.log.hydration",
      "care.log.molt",
    ],
  },
  {
    name: "Basic",
    description: "For growing spood families.",
    sortOrder: 2,
    maxSpiders: 5,
    monthlyCents: 199,
    annualCents: 1999,
    features: [
      "spood.create",
      "spood.about.view",
      "spood.about.edit",
      "care.log.feeding",
      "care.log.hydration",
      "care.log.molt",
      "care.log.handling",
      "care.log.cleaning",
      "care.log.health",
      "story.timeline",
    ],
  },
  {
    name: "Pro",
    description: "For dedicated keepers.",
    sortOrder: 3,
    maxSpiders: null,
    monthlyCents: 499,
    annualCents: 4999,
    features: [
      "spood.create",
      "spood.about.view",
      "spood.about.edit",
      "care.log.feeding",
      "care.log.hydration",
      "care.log.molt",
      "care.log.handling",
      "care.log.cleaning",
      "care.log.health",
      "story.timeline",
      "photos.gallery",
      "photos.upload",
    ],
  },
];

async function main() {
  assertDemoSeedTarget();
  // Feature rows back the translations; keys mirror the code registry.
  const featureKeys = new Set(PLAN_INPUTS.flatMap((plan) => plan.features));
  const features = new Map<string, string>();
  for (const key of featureKeys) {
    const feature = await prisma.feature.upsert({
      where: { key },
      create: { key, name: key, description: "Demo catalog feature.", category: "demo", active: true },
      update: { active: true },
    });
    features.set(key, feature.id);
  }

  for (const plan of PLAN_INPUTS) {
    const existing = await prisma.plan.findFirst({ where: { name: plan.name } });
    const record =
      existing ??
      (await prisma.plan.create({
        data: { name: plan.name, description: plan.description, planType: "STANDARD", maxSpiders: plan.maxSpiders, active: true, public: true, sortOrder: plan.sortOrder },
      }));
    await prisma.plan.update({
      where: { id: record.id },
      data: { description: plan.description, planType: "STANDARD", maxSpiders: plan.maxSpiders, active: true, public: true, sortOrder: plan.sortOrder },
    });
    await prisma.planBillingOption.deleteMany({ where: { planId: record.id } });
    await prisma.planBillingOption.createMany({
      data: [
        { planId: record.id, interval: "MONTHLY", basePriceCents: plan.monthlyCents, active: true, sortOrder: 1 },
        { planId: record.id, interval: "ANNUAL", basePriceCents: plan.annualCents, active: true, sortOrder: 2 },
      ],
    });
    await prisma.featurePlanTranslation.deleteMany({ where: { planId: record.id } });
    await prisma.featurePlanTranslation.createMany({
      data: plan.features.map((key) => ({
        planId: record.id,
        featureId: features.get(key)!,
        enabled: true,
      })),
    });
    console.log(`seeded plan: ${plan.name}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());