import { guardMaintenance, prepareCredentialChange } from './admin/maintenance-access';
import { MaintenanceError } from './admin/maintenance-policy';
import { maintenanceTransaction } from './maintenance-write';
import { prisma } from "./db";
import { CHALLENGE_MS, createVerificationToken, verificationTokenHash } from "./email-verification";
import { sendEmailChangeConfirmation, sendEmailChangeNotice, sendVerificationEmail } from "./email-delivery";
import { randomUUID } from "node:crypto";
import { emailChangeCredentialSnapshot } from "./credential-version";
import type { Prisma } from "@prisma/client";

export const GENERIC_EMAIL_RESPONSE = "If this address can receive a verification link, we’ve sent one. Check your inbox.";

export async function issueEmailChallenge(email: string, name?: string): Promise<void> {
  const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, passwordHash: true, emailVerified: true } });
  if (existing && (!existing.passwordHash || existing.emailVerified)) return;
  const purpose = existing ? "legacy" : "register";
  const token = createVerificationToken();
  await maintenanceTransaction(async (tx) => {
    await tx.pendingEmailVerification.deleteMany({ where: { email, purpose, consumedAt: null } });
    await tx.pendingEmailVerification.create({ data: {
      tokenHash: verificationTokenHash(token), email, name: existing ? null : name || null,
      userId: existing?.id ?? null, purpose, expiresAt: new Date(Date.now() + CHALLENGE_MS),
    } });
  });
  await guardMaintenance('write');
  await sendVerificationEmail(email, token);
}

export async function lookupEmailChallenge(token: string) {
  await guardMaintenance('read');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return prisma.pendingEmailVerification.findFirst({
    where: { tokenHash: verificationTokenHash(token), consumedAt: null, expiresAt: { gt: new Date() } },
    select: { purpose: true },
  });
}

export async function completeNewEmailRegistration(token: string, passwordHash: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const now = new Date();
  try {
    return await maintenanceTransaction(async (tx) => {
      const challenge = await tx.pendingEmailVerification.findUnique({ where: { tokenHash: verificationTokenHash(token) } });
      if (!challenge || challenge.purpose !== "register" || challenge.consumedAt || challenge.expiresAt <= now) return null;
      const existing = await tx.user.findFirst({ where: { email: { equals: challenge.email, mode: "insensitive" } }, select: { id: true } });
      if (existing) return null;
      const claimed = await tx.pendingEmailVerification.updateMany({ where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
      if (claimed.count !== 1) return null;
      await tx.user.create({ data: { email: challenge.email, name: challenge.name || challenge.email.split("@")[0], passwordHash, emailVerified: now } });
      // The claimed proof has served its purpose. Remove its identity metadata in
      // this transaction so future account erasure leaves no unbound registration.
      await tx.pendingEmailVerification.delete({ where: { id: challenge.id } });
      return challenge.email;
    });
  } catch (error) {
    if(error instanceof MaintenanceError) throw error;
    console.error("[verify-email] registration failed", error);
    return null;
  }
}

export async function verifyExistingEmail(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const now = new Date();
  try {
    return await maintenanceTransaction(async (tx) => {
      const challenge = await tx.pendingEmailVerification.findUnique({ where: { tokenHash: verificationTokenHash(token) } });
      if (!challenge || challenge.purpose !== "legacy" || !challenge.userId || challenge.consumedAt || challenge.expiresAt <= now) return false;
      const claimed = await tx.pendingEmailVerification.updateMany({ where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
      if (claimed.count !== 1) return false;
      const updated = await tx.user.updateMany({ where: { id: challenge.userId, email: { equals: challenge.email, mode: "insensitive" }, passwordHash: { not: null }, emailVerified: null }, data: { emailVerified: now } });
      return updated.count === 1;
    });
  } catch (error) {
    if(error instanceof MaintenanceError) throw error;
    console.error("[verify-email] legacy verification failed", error);
    return false;
  }
}

/** The current login address stays intact until the new inbox proves ownership. */
export type PreparedEmailChange = { status: "prepared"; token: string; tokenHash: string; previousEmail: string; previousEmailVerified: boolean } |
  { status: "same" | "unavailable" };

/** Creates a target-bound challenge inside the caller's locked transaction. */
export async function prepareEmailChange(tx: Prisma.TransactionClient, input: {
  userId: string; email: string; requestedByAdminId?: string;
}): Promise<PreparedEmailChange> {
  const token = createVerificationToken();
  const tokenHash = verificationTokenHash(token);
    const account = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, email: true, emailVerified: true, passwordHash: true, authVersion: true, emailChangeVersion: true, adminVersion: true } });
    if (!account) return { status: "unavailable" as const };
    if (account.email.toLowerCase() === input.email) return { status: "same" as const };
    const occupied = await tx.user.findFirst({ where: { email: { equals: input.email, mode: "insensitive" } }, select: { id: true } });
    if (occupied) return { status: "unavailable" as const };
    await tx.pendingEmailVerification.deleteMany({ where: { userId: input.userId, purpose: "email-change", consumedAt: null } });
    await tx.pendingEmailVerification.create({ data: {
      tokenHash, email: input.email, previousEmail: account.email, userId: input.userId, purpose: "email-change",
      requestedByAdminId: input.requestedByAdminId,
      credentialSnapshot: emailChangeCredentialSnapshot(account),
      expiresAt: new Date(Date.now() + CHALLENGE_MS),
    } });
    return { status: "prepared", token, tokenHash, previousEmail: account.email, previousEmailVerified: Boolean(account.emailVerified) };
}

export async function deliverPreparedEmailChange(prepared: Extract<PreparedEmailChange, { status: "prepared" }>, email: string): Promise<void> {
  await guardMaintenance('write');
  await sendEmailChangeConfirmation(email, prepared.token);
  if (prepared.previousEmailVerified) {
    try { await sendEmailChangeNotice(prepared.previousEmail, email); }
    catch (error) {
    if(error instanceof MaintenanceError) throw error; console.error("[email-change] old-address notice failed", error); }
  }
}

export async function requestEmailChange(userId: string, email: string): Promise<"sent" | "same" | "unavailable"> {
  const prepared = await maintenanceTransaction(tx => prepareEmailChange(tx, { userId, email }));
  if (prepared.status !== "prepared") return prepared.status;
  try {
    await deliverPreparedEmailChange(prepared, email);
  } catch (error) {
    if(error instanceof MaintenanceError) throw error;
    await prisma.pendingEmailVerification.deleteMany({ where: { tokenHash: prepared.tokenHash } });
    throw error;
  }
  return "sent";
}

export async function confirmEmailChange(token: string): Promise<boolean> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false;
  const now = new Date();
  try {
    return await maintenanceTransaction(async (tx) => {
      const challenge = await tx.pendingEmailVerification.findUnique({ where: { tokenHash: verificationTokenHash(token) } });
      if (!challenge || challenge.purpose !== "email-change" || !challenge.userId || !challenge.previousEmail || !challenge.credentialSnapshot ||
          challenge.consumedAt || challenge.expiresAt <= now) return false;
      const account = await tx.user.findUnique({ where: { id: challenge.userId }, select: { id: true, email: true, passwordHash: true, authVersion: true, emailChangeVersion: true, adminVersion: true } });
      if (!account || account.email !== challenge.previousEmail || emailChangeCredentialSnapshot(account) !== challenge.credentialSnapshot) return false;
      const occupied = await tx.user.findFirst({ where: { email: { equals: challenge.email, mode: "insensitive" } }, select: { id: true } });
      if (occupied) return false;
      await prepareCredentialChange(tx, challenge.userId);
      const claimed = await tx.pendingEmailVerification.updateMany({ where: { id: challenge.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
      if (claimed.count !== 1) return false;
      const changed = await tx.user.updateMany({
        where: { id: challenge.userId, email: challenge.previousEmail, passwordHash: account.passwordHash,
          authVersion: account.authVersion, emailChangeVersion: account.emailChangeVersion, adminVersion: account.adminVersion },
        data: { email: challenge.email, emailVerified: now, emailChangeVersion: randomUUID(), accountVersion: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error("Email changed while the link was being verified.");
      if (challenge.requestedByAdminId) {
        const { appendAudit } = await import("./admin/audit");
        await appendAudit(tx, { actorId: challenge.requestedByAdminId, targetId: challenge.userId,
          action: "account.email_change.confirmed", reason: "New address confirmed by the account holder",
          changes: { result: "confirmed" } });
      }
      return true;
    });
  } catch (error) {
    if(error instanceof MaintenanceError) throw error;
    console.error("[email-change] confirmation failed", error);
    return false;
  }
}
