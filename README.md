# LastTray — Vercel deployment (fixed root layout)

This is the LastTray same-day surplus marketplace for small bakeries and grocery shops.

## IMPORTANT: keep these files together

The Vercel project root must contain these files side by side:

- `index.html`
- `main.js`
- `style.css`
- `config.js`
- `favicon.svg`
- `vercel.json`
- `supabase/schema.sql`

Do not deploy the parent folder with these files tucked one level down. Do not upload only `index.html`.

## Deploy

1. Extract this ZIP.
2. Put the *contents* of the extracted folder in the root of a GitHub repository (not an extra nested folder).
3. In Vercel, import that repository.
4. Set Framework Preset to **Other**.
5. Set Root Directory to `.` (the repository root).
6. Leave Build Command empty. Set Output Directory to `.`.
7. Deploy.

After deployment, test these two addresses, replacing the domain:

- `https://YOUR-DOMAIN.vercel.app/main.js`
- `https://YOUR-DOMAIN.vercel.app/style.css`

Both must return file contents, not a Vercel 404 page. Then open the root domain. If the app module still cannot load, the page will now show an explicit error instead of remaining on “Setting the tray…”.

## Demo mode

The site runs in demo mode with illustrative sample listings. Reservations and seller listings are stored in the current browser only. This is suitable for a walkthrough, not cross-device production.

## Shared marketplace backend

For shared real-user data, configure Supabase:

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy the Project URL and anon/public key into `config.js`:

```js
window.LASTTRAY_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_PUBLIC_KEY'
};
```

4. In Supabase Authentication URL settings, add your deployed Vercel URL to the allowed redirect URLs.
5. Redeploy Vercel.

Never put a Supabase `service_role` key in browser code.

## Limitations to resolve before public launch

- Demo mode is browser-local, not shared across users.
- The supplied Supabase schema and browser client must be configured and tested in your own project before handling real reservations.
- No payment gateway, WhatsApp/SMS notifications, seller verification, delivery, or regulatory verification is included.
- Shop owners remain responsible for deciding whether items are safe and eligible; LastTray must never list expired or unsafe food.
