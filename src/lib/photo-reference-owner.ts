import type { Prisma } from "@prisma/client";

type PhotoOwnerDatabase = {
  spider: {
    findFirst(args: { where: Prisma.SpiderWhereInput; select: { id: true } }): PromiseLike<{ id: string } | null>;
  };
};

/** Authorize every relational photo field through its owning keeper. */
export async function ownsPhotoReference(
  reference: string,
  userId: string,
  db: PhotoOwnerDatabase,
): Promise<boolean> {
  const spider = await db.spider.findFirst({
    where: {
      userId,
      OR: [
        { profilePhoto: reference },
        { photos: { some: { url: reference } } },
        { enclosure: { is: { photo: reference } } },
        { feedings: { some: { photoUrl: reference } } },
        { molts: { some: { OR: [{ moltPhoto: reference }, { postMoltPhoto: reference }] } } },
        { observations: { some: { photoUrl: reference } } },
      ],
    },
    select: { id: true },
  });
  return Boolean(spider);
}
