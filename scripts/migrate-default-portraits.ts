import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const map: Record<string, string> = {
  "/spoods/star.svg": "/spoods/defaults/star.svg",
  "/spoods/clementine.svg": "/spoods/defaults/clementine.svg",
  "/spoods/mochi.svg": "/spoods/defaults/mochi.svg",
  "/spoods/wednesday.svg": "/spoods/defaults/wednesday.svg",
  "/spoods/vylit.svg": "/spoods/defaults/vylit.svg",
};

async function main() {
  for (const [from, to] of Object.entries(map)) {
    const r = await prisma.spider.updateMany({
      where: { profilePhoto: from },
      data: { profilePhoto: to },
    });
    console.log(from, "->", to, r.count);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
