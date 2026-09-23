# Social sign-in setup for staging

Google, Apple, and Facebook are optional. A provider button appears only when both of its credentials are configured. Email/password remains available. Use **staging-only** provider apps and the staging Vercel project's environment settings; never copy live credentials or configure the live site during this rollout.

Stable staging origin: `https://spoodly-space-staging-beccapossibles-projects.vercel.app`

| Provider | Staging callback URL | Server environment variables |
| --- | --- | --- |
| Google | `https://spoodly-space-staging-beccapossibles-projects.vercel.app/api/auth/callback/google` | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |
| Apple | `https://spoodly-space-staging-beccapossibles-projects.vercel.app/api/auth/callback/apple` | `AUTH_APPLE_ID`, `AUTH_APPLE_SECRET` |
| Facebook | `https://spoodly-space-staging-beccapossibles-projects.vercel.app/api/auth/callback/facebook` | `AUTH_FACEBOOK_ID`, `AUTH_FACEBOOK_SECRET` |

Set `AUTH_URL` to the stable staging origin and keep the existing staging `AUTH_SECRET`. Store secrets only in the staging Vercel project's environment variables. Do not paste them into chat, a ticket, the repository, or browser-visible `NEXT_PUBLIC_*` variables. After adding or rotating credentials, redeploy that staging project so the server receives them.

## Provider accounts and consoles

1. **Google:** Create a Google Cloud project and an OAuth client of type **Web application**. Configure the consent screen and its test users while the app is in testing. Register the Google callback URL above as an authorized redirect URI. Put the client ID and client secret in the staging Vercel variables. The redirect URI must match exactly. [Google OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server), [Auth.js Google setup](https://authjs.dev/getting-started/providers/google).
2. **Apple:** An Apple Developer account needs a primary App ID enabled for Sign in with Apple, a Services ID for the website, the staging domain and Apple callback URL registered under that Services ID, and a Sign in with Apple private key. `AUTH_APPLE_ID` is the Services ID; `AUTH_APPLE_SECRET` is the signed client-secret JWT generated from the Apple team ID, key ID, and private key. Keep the `.p8` key private and plan to rotate the JWT before it expires. Apple returns to the app with a cross-site POST, so linking an Apple account should be tested in a real browser with a freshly renewed staging session. [Apple web setup](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web), [Apple key setup](https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key), [Auth.js Apple setup](https://authjs.dev/getting-started/providers/apple).
3. **Facebook:** Create a Meta for Developers app with Facebook Login for the web. Register the Facebook callback URL as a valid OAuth redirect URI and allow the staging domain. Use the app ID and app secret for the staging variables. During development, invite the test accounts/roles permitted by the Meta app; check the permissions and app-mode rules before wider use. Facebook may omit an email for some accounts, so test the missing-email message. [Auth.js Facebook setup](https://authjs.dev/getting-started/providers/facebook), [Meta developer apps](https://developers.facebook.com/apps/).

Enable and test **one provider at a time**. Keep buttons hidden until each app and its credentials are ready. Instagram is not part of this login feature.

## Staging acceptance checks

- Create a new keeper with the provider, sign out, then sign in again; confirm the same keeper and spoods appear.
- From a password account, connect a provider in Settings; sign out and return through that provider to the same keeper. For Apple, use a fresh session and verify the actual POST callback in a browser.
- Try a provider email already owned by an unlinked password account; it must show a helpful collision message and must not merge accounts by email.
- Cancel provider consent and test a provider account with no available email; neither path should create a usable partial keeper.
- Check keyboard focus, button labels, mobile layout, and Settings' connected-provider list.
- Verify only identity fields are stored for linked provider accounts, with no access, refresh, or ID tokens.

Status (September 16, 2026): The staging Google OAuth client is configured. Both `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are present in the staging Vercel project's Production environment, the separate staging project has been redeployed, and its Google button reaches Google's sign-in page with the stable staging callback URL. Completing a Google sign-in and linking it to an existing keeper still requires a keeper to authenticate in the browser. Apple Developer and Meta for Developers apps are not yet configured, so Apple and Facebook buttons remain hidden.
