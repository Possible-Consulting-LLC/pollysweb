# Private photos

New uploads store `spood-storage:<object path>` in the existing URL columns. Existing Supabase public URL values remain readable during staging migration. All Storage-backed `<img>` sources become same-origin `/api/photos?ref=...` requests. The route requires an active session and an exact database reference owned by that user before using a service-role client to download bytes. Responses allow only JPEG, PNG, WebP, or GIF, with `no-store` and `nosniff` headers. Built-in avatars and local development uploads continue to render normally.

The private `spoods` bucket is a separate staging cutover after deploying this compatibility code and migrating existing references/objects. No database or Storage mutation occurs during implementation.
