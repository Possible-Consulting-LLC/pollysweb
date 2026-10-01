-- NewsletterSubscriber: public footer newsletter interest list. Email is the
-- identity; resubscribing an existing address is a no-op at the action layer.
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");
