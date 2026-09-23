import { guardMaintenance, guardServiceMaintenance } from './admin/maintenance-access';
import { mutationIdentity } from './mutation-context';
import "server-only";
import { createBillingService } from "./billing-service-core";
import { prisma } from "./db";
import { getStripe, priceIdForInterval } from "./stripe";
import { appUrl, legacyProPriceIds } from "./billing";

export const { checkoutForUser, portalForUser, recoverCheckoutForUser, reconcileStripeCustomer } = createBillingService({
  admit: tx => mutationIdentity.getStore() ? guardMaintenance('write', undefined, tx) : guardServiceMaintenance(tx),
  prisma, getStripe, priceIdForInterval, legacyPriceIds: legacyProPriceIds, appUrl,
});
