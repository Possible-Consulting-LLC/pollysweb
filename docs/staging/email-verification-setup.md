# Email verification setup for staging

1. Configure a dedicated Resend key as `EMAIL_RESEND_API_KEY`; keep the feedback `RESEND_API_KEY` unset in staging.
2. Configure a verified sender in `EMAIL_FROM_EMAIL`, the authentication origin in `AUTH_URL`, the public link origin in `EMAIL_VERIFICATION_ORIGIN`, and comma-separated test inboxes in `EMAIL_ALLOWED_RECIPIENTS`. Set the link origin to `https://staging.spoodlyspace.com` without changing the OAuth callback origin in `AUTH_URL`. Staging refuses to build with a dedicated key unless sender, HTTPS origins, and allowlist are valid. Sending itself also fails closed without those settings.
3. Apply the new `PendingEmailVerification` migration to staging through the normal reviewed deployment process. It creates only the challenge table; it does not mark any existing email verified or start a grace deadline.
4. Test a new address: the registration form sends a link; the link opens a password form; a user row appears only after that form is submitted. Test expiry, resend, and one-time use using allowed inboxes.
5. Only after delivery works, set `PASSWORD_EMAIL_VERIFICATION_GRACE_START` to the UTC activation instant, such as `2026-09-17T00:00:00Z`. Existing password users with no verified email can sign in for seven days after this time. Removing the setting pauses enforcement if sender delivery has an outage.

The app deliberately gives the same public registration and resend response for existing and new email addresses. If a provider reports a delivery error after configuration, the server logs it while the public response stays generic. Operators should monitor delivery failures.

To test the feedback form in staging, set `FEEDBACK_TO_EMAIL` to an address already in `EMAIL_ALLOWED_RECIPIENTS` and redeploy. Staging feedback uses `EMAIL_RESEND_API_KEY` and `EMAIL_FROM_EMAIL`; keep the live `RESEND_API_KEY` unset. Without an explicit allowed feedback recipient, the form fails closed before sending.
