import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "owner@local.test";
  // Fresh local DB: no prior owner row, so no delete needed (user deletion is trigger-guarded).
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Local Suite Owner",
      role: "super_admin",
      emailVerified: new Date(),
      passwordHash: await bcrypt.hash("local-owner-only-9x", 10),
    },
    update: { role: "super_admin", emailVerified: new Date() },
  });
  await prisma.protectedOwner.upsert({
    where: { id: 1 },
    create: { id: 1, userId: user.id },
    update: { userId: user.id },
  });
  console.log("ADMIN_OWNER_ID=" + user.id);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
