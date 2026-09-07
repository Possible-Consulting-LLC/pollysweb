import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@spoodly.space";
  const passwordHash = await bcrypt.hash("spoodly123", 10);

  await prisma.feedingEvent.deleteMany();
  await prisma.mistingEvent.deleteMany();
  await prisma.moltEvent.deleteMany();
  await prisma.observationEvent.deleteMany();
  await prisma.bodyConditionEvent.deleteMany();
  await prisma.enclosureMaintenanceEvent.deleteMany();
  await prisma.photo.deleteMany();
  await prisma.reminder.deleteMany();
  await prisma.enclosure.deleteMany();
  await prisma.spider.deleteMany();
  await prisma.user.deleteMany({ where: { email } });

  const user = await prisma.user.create({
    data: {
      email,
      name: "Keeper",
      passwordHash,
      plan: "pro",
      subscriptionStatus: "demo",
      feedDefaultDays: 3,
      mistDefaultDays: 1,
      cleanDefaultDays: 14,
    },
  });

  const star = await prisma.spider.create({
    data: {
      userId: user.id,
      name: "Star",
      species: "Phidippus regius",
      commonName: "Regal Jumping Spider",
      sex: "Female",
      instar: "i8",
      hatchDate: new Date("2025-11-12"),
      acquisitionDate: new Date("2026-03-01"),
      source: "Moonlit Arachnids",
      status: "Normal",
      profilePhoto: "/spoods/defaults/star.svg",
      notes: "Curious explorer. Loves watching from her hammock corner.",
    },
  });

  await prisma.enclosure.create({
    data: {
      spiderId: star.id,
      name: "Star's Orbit",
      dimensions: "8×8×12 in",
      setupDate: new Date("2026-03-01"),
      type: "acrylic",
      notes: "Cork bark hide, silk-friendly corners, tiny water dish ledge.",
      photo: "/spoods/enclosure.svg",
      lastCleaned: new Date("2026-08-20"),
      lastRehoused: new Date("2026-03-01"),
      maintenance: {
        create: [
          {
            date: new Date("2026-08-20"),
            kind: "cleaning",
            notes: "Spot cleaned silk and refreshed substrate.",
          },
          {
            date: new Date("2026-03-01"),
            kind: "rehouse",
            notes: "Moved into adult enclosure.",
          },
        ],
      },
    },
  });

  await prisma.moltEvent.createMany({
    data: [
      {
        spiderId: star.id,
        moltDate: new Date("2026-06-18"),
        previousInstar: "i6",
        newInstar: "i7",
        successful: true,
        approximate: false,
        moltPhoto: "/spoods/molt-i7.svg",
        notes: "Clean molt overnight.",
        daysSincePriorMolt: null,
      },
      {
        spiderId: star.id,
        moltDate: new Date("2026-07-20"),
        previousInstar: "i7",
        newInstar: "i8",
        successful: true,
        approximate: false,
        moltPhoto: "/spoods/molt-i8.svg",
        postMoltPhoto: "/spoods/star.svg",
        notes: "Came out shiny and bold.",
        daysSincePriorMolt: 32,
        fastingDaysBefore: 8,
      },
      {
        spiderId: star.id,
        moltDate: new Date("2026-08-30"),
        previousInstar: "i8",
        newInstar: "i8",
        successful: true,
        approximate: true,
        notes: "Sample later molt placeholder — kept at i8 for demo.",
        daysSincePriorMolt: 41,
        fastingDaysBefore: 10,
      },
    ],
  });

  await prisma.moltEvent.deleteMany({
    where: { spiderId: star.id, moltDate: new Date("2026-08-30") },
  });

  await prisma.moltEvent.create({
    data: {
      spiderId: star.id,
      moltDate: new Date("2026-05-10"),
      previousInstar: "i5",
      newInstar: "i6",
      successful: true,
      moltPhoto: "/spoods/molt-i6.svg",
      notes: "First molt after arriving home.",
      daysSincePriorMolt: null,
      fastingDaysBefore: 6,
    },
  });

  await prisma.feedingEvent.createMany({
    data: [
      {
        spiderId: star.id,
        date: new Date("2026-09-02"),
        preyType: "house flies",
        quantity: 1,
        preySize: "medium",
        outcome: "Ate normally",
        notes: "Pounced immediately.",
      },
      {
        spiderId: star.id,
        date: new Date("2026-08-29"),
        preyType: "blue bottle flies",
        quantity: 1,
        outcome: "Ate partially",
      },
      {
        spiderId: star.id,
        date: new Date("2026-08-25"),
        preyType: "house flies",
        quantity: 1,
        outcome: "Ignored prey",
        notes: "Seemed restless — possible premolt window later.",
      },
      {
        spiderId: star.id,
        date: new Date("2026-08-20"),
        preyType: "crickets",
        quantity: 1,
        preySize: "small",
        outcome: "Ate normally",
      },
    ],
  });

  await prisma.mistingEvent.createMany({
    data: [
      {
        spiderId: star.id,
        date: new Date("2026-09-04"),
        mistedEnclosure: true,
        waterDroplet: true,
        notes: "Drank from a side droplet.",
      },
      {
        spiderId: star.id,
        date: new Date("2026-09-03"),
        mistedEnclosure: true,
        waterDroplet: false,
      },
      {
        spiderId: star.id,
        date: new Date("2026-09-01"),
        mistedEnclosure: true,
        waterDroplet: true,
      },
    ],
  });

  await prisma.bodyConditionEvent.createMany({
    data: [
      {
        spiderId: star.id,
        date: new Date("2026-09-02"),
        condition: "Normal",
        notes: "Nice round abdomen after feeding.",
      },
      {
        spiderId: star.id,
        date: new Date("2026-08-25"),
        condition: "Thin",
        notes: "Before the ignored fly offer.",
      },
      {
        spiderId: star.id,
        date: new Date("2026-08-10"),
        condition: "Plump",
      },
    ],
  });

  await prisma.observationEvent.createMany({
    data: [
      {
        spiderId: star.id,
        date: new Date("2026-09-03"),
        kind: "built a new hammock",
        notes: "New silk nest in the upper left corner.",
        photoUrl: "/spoods/hammock.svg",
      },
      {
        spiderId: star.id,
        date: new Date("2026-08-28"),
        kind: "unusually active",
        notes: "Patrols the front panel every evening.",
      },
      {
        spiderId: star.id,
        date: new Date("2026-08-15"),
        kind: "explored enclosure",
      },
      {
        spiderId: star.id,
        date: new Date("2026-03-01"),
        kind: "behavior note",
        notes: "Came home and settled into her first hammock the same night.",
      },
    ],
  });

  await prisma.photo.createMany({
    data: [
      {
        spiderId: star.id,
        url: "/spoods/star.svg",
        caption: "Star posing",
        kind: "profile",
        takenAt: new Date("2026-09-01"),
      },
      {
        spiderId: star.id,
        url: "/spoods/molt-i8.svg",
        caption: "Fresh i8 colors",
        kind: "molt",
        takenAt: new Date("2026-07-21"),
      },
      {
        spiderId: star.id,
        url: "/spoods/hammock.svg",
        caption: "New hammock",
        kind: "observation",
        takenAt: new Date("2026-09-03"),
      },
    ],
  });

  await prisma.reminder.createMany({
    data: [
      { userId: user.id, spiderId: star.id, kind: "feeding", intervalDays: 3, enabled: true },
      { userId: user.id, spiderId: star.id, kind: "misting", intervalDays: 1, enabled: true },
      { userId: user.id, spiderId: star.id, kind: "cleaning", intervalDays: 14, enabled: true },
    ],
  });

  const clementine = await prisma.spider.create({
    data: {
      userId: user.id,
      name: "Clementine",
      species: "Phidippus audax",
      commonName: "Bold Jumping Spider",
      sex: "Female",
      instar: "i7",
      acquisitionDate: new Date("2026-06-15"),
      source: "Local rescue",
      status: "Normal",
      profilePhoto: "/spoods/defaults/clementine.svg",
      notes: "Tiny daredevil.",
    },
  });

  await prisma.feedingEvent.create({
    data: {
      spiderId: clementine.id,
      date: new Date("2026-08-30"),
      preyType: "fruit flies",
      quantity: 3,
      outcome: "Ate normally",
    },
  });
  await prisma.mistingEvent.create({
    data: {
      spiderId: clementine.id,
      date: new Date("2026-09-05"),
      mistedEnclosure: true,
      waterDroplet: false,
    },
  });

  const mochi = await prisma.spider.create({
    data: {
      userId: user.id,
      name: "Mochi",
      species: "Phidippus regius",
      commonName: "Regal Jumping Spider",
      sex: "Male",
      instar: "i6",
      acquisitionDate: new Date("2026-07-01"),
      status: "Normal",
      profilePhoto: "/spoods/defaults/mochi.svg",
    },
  });
  await prisma.feedingEvent.create({
    data: {
      spiderId: mochi.id,
      date: new Date("2026-09-04"),
      preyType: "fruit flies",
      quantity: 2,
      outcome: "Ate normally",
    },
  });
  await prisma.mistingEvent.create({
    data: {
      spiderId: mochi.id,
      date: new Date("2026-09-03"),
      mistedEnclosure: true,
      waterDroplet: true,
    },
  });

  const wednesday = await prisma.spider.create({
    data: {
      userId: user.id,
      name: "Wednesday",
      species: "Phidippus regius",
      commonName: "Regal Jumping Spider",
      sex: "Unknown",
      instar: "i7",
      acquisitionDate: new Date("2026-05-20"),
      status: "Premolt",
      profilePhoto: "/spoods/defaults/wednesday.svg",
      notes: "Dark morph vibes. Currently fasting in a sealed hammock.",
    },
  });
  await prisma.feedingEvent.create({
    data: {
      spiderId: wednesday.id,
      date: new Date("2026-08-18"),
      preyType: "house flies",
      quantity: 1,
      outcome: "Refused prey",
    },
  });
  await prisma.mistingEvent.create({
    data: {
      spiderId: wednesday.id,
      date: new Date("2026-09-04"),
      mistedEnclosure: true,
      waterDroplet: false,
    },
  });

  console.log("Seeded demo keeper:", email, "/ password: spoodly123");
  console.log("Spiders:", star.name, clementine.name, mochi.name, wednesday.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
