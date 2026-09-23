import { maintenanceTransaction } from './maintenance-write';
import type { Prisma } from "@prisma/client";
import { SUCCESSFUL_FEEDING_OUTCOMES } from "./constants";
import {
  deriveMoltMetrics,
  maintenanceSummary,
  reconcileMoltState,
} from "./history-state";
import { assertSpiderWritableInTransaction } from "./spider-write-policy";

export async function mutateMolt(
  spiderId: string,
  mutation: (tx: Prisma.TransactionClient) => Promise<unknown>,
  created = false,
) {
  return maintenanceTransaction(async (tx) => {
    const owner = await tx.spider.findUniqueOrThrow({ where: { id: spiderId }, select: { userId: true } });
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${owner.userId} FOR UPDATE`;
    const account = await tx.user.findUniqueOrThrow({ where: { id: owner.userId }, select: { deletingAt: true } });
    if (account.deletingAt) throw new Error("Account is unavailable for writes.");
    await assertSpiderWritableInTransaction(tx, owner.userId, spiderId);
    await tx.$queryRaw`SELECT id FROM "Spider" WHERE id = ${spiderId} FOR UPDATE`;
    const spider = await tx.spider.findUniqueOrThrow({
      where: { id: spiderId },
      include: { user: { select: { timezone: true } } },
    });
    const latest = () =>
      tx.moltEvent.findFirst({
        where: { spiderId, successful: true },
        orderBy: [{ moltDate: "desc" }, { id: "desc" }],
      });
    const before = await latest();
    await mutation(tx);
    const after = await latest();
    const zone = spider.user.timezone || "UTC";
    const data = reconcileMoltState(spider, before, after, created, zone);
    if (Object.keys(data).length) {
      await tx.spider.update({ where: { id: spiderId }, data });
    }

    const [molts, feedings] = await Promise.all([
      tx.moltEvent.findMany({
        where: { spiderId },
        select: { id: true, moltDate: true, successful: true },
      }),
      tx.feedingEvent.findMany({
        where: {
          spiderId,
          outcome: { in: [...SUCCESSFUL_FEEDING_OUTCOMES] },
        },
        select: { date: true },
      }),
    ]);
    for (const metric of deriveMoltMetrics(
      molts,
      feedings.map((feeding) => feeding.date),
      zone,
    )) {
      await tx.moltEvent.update({
        where: { id: metric.id },
        data: {
          daysSincePriorMolt: metric.daysSincePriorMolt,
          fastingDaysBefore: metric.fastingDaysBefore,
        },
      });
    }
  });
}

export async function mutateMaintenance(
  enclosureId: string,
  mutation: (tx: Prisma.TransactionClient) => Promise<unknown>,
) {
  return maintenanceTransaction(async (tx) => {
    const owner = await tx.enclosure.findUniqueOrThrow({ where: { id: enclosureId }, select: { spider: { select: { userId: true } } } });
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${owner.spider.userId} FOR UPDATE`;
    const account = await tx.user.findUniqueOrThrow({ where: { id: owner.spider.userId }, select: { deletingAt: true } });
    if (account.deletingAt) throw new Error("Account is unavailable for writes.");
    const spider = await tx.enclosure.findUniqueOrThrow({ where: { id: enclosureId }, select: { spiderId: true } });
    await assertSpiderWritableInTransaction(tx, owner.spider.userId, spider.spiderId);
    await tx.$queryRaw`SELECT id FROM "Enclosure" WHERE id = ${enclosureId} FOR UPDATE`;
    await mutation(tx);
    const [clean, rehouse] = await Promise.all(
      ["cleaning", "rehouse"].map((kind) =>
        tx.enclosureMaintenanceEvent.findFirst({
          where: { enclosureId, kind },
          orderBy: { date: "desc" },
          select: { date: true, kind: true },
        }),
      ),
    );
    await tx.enclosure.update({
      where: { id: enclosureId },
      data: maintenanceSummary(
        [clean, rehouse].filter(
          (row): row is NonNullable<typeof row> => row !== null,
        ),
      ),
    });
  });
}
