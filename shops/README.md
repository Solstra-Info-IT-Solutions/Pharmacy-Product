# Shop modules

One codebase (`mobile/`, `backend/`), many shops. Everything that differs between shops lives in a module folder here, so a new shop needs **no code changes**.

```
shops/
  default                     the shop used when SHOP is not set (local dev)
  _template/shop.json         defaults for new shops (all theme colours)
  <shop-id>/
    shop.json                 name, Hindi name, taglines, API URL, app ids, Expo project, theme colours
    assets/icon.png           1024×1024 app icon
    assets/adaptive-icon.png  1024×1024 Android adaptive icon (keep the logo in the middle 66%)
    assets/splash-icon.png    splash screen image
    assets/logo.png           login screen, splash animation, PDF invoice
    assets/favicon.png        website favicon (optional)
    google-services.json      Firebase Android app (package must equal app.androidPackage)
    GoogleService-Info.plist  Firebase iOS app (optional)
    firebase-web.json         Firebase web app config, for web push on the admin site (optional)
```

The shop is chosen by the `SHOP` environment variable (or `shops/default`):

- **App** – `mobile/app.config.js` reads the module for name, package id, icons, splash, Firebase files and theme; `metro.config.js` maps `@shop/...` to the module folder; the app reads the rest from `src/shop.ts`.
- **Backend** – `backend/src/config.ts` reads `shops/$SHOP/shop.json` for the name, colours and logo on invoices and notifications. Each shop runs **its own backend server and its own database** (same code, different `.env`).
- **EAS builds** – every shop gets `<id>-preview` and `<id>-production` profiles in `mobile/eas.json` that set `SHOP` on the build server (added automatically).

## Super admin tools

Run from the repository root (Node 20+):

```bash
npm run superadmin        # browser panel at http://127.0.0.1:4900: create shops, edit details/theme, upload files, start builds
npm run shop -- list      # all shops and whether they are ready
npm run shop -- new sharma-pharmacy --name "Sharma Pharmacy" --primary "#0B8F6A"
npm run shop -- check sharma-pharmacy
npm run shop -- web sharma-pharmacy           # web preview of that shop's app
npm run shop -- env sharma-pharmacy           # .env template for that shop's backend
npm run shop -- build sharma-pharmacy preview android
npm run shop -- use sharma-pharmacy           # make it the default for local dev
```

The panel only listens on 127.0.0.1 and only writes module files and EAS profiles.

## Adding a shop, step by step

1. **Create the module** – panel → *New shop*, or `npm run shop -- new <id> --name "<Name>"`. Placeholder images in the brand colour are generated.
2. **Theme and details** – set colours (live preview in the panel), Hindi name, taglines.
3. **Images** – upload icon, adaptive icon, splash and logo.
4. **Firebase** – create a Firebase project for the shop, enable *Phone* sign-in and Cloud Messaging, add an Android app with the shop's package id, download `google-services.json` and upload it. For web push, add a web app and save its `firebaseConfig` as `firebase-web.json`. Optionally add the iOS app and `GoogleService-Info.plist`.
5. **Backend** – create a database (Supabase project) with the same schema as an existing shop, deploy `backend/` to a new server with the `.env` from `npm run shop -- env <id>` (fill the secrets in the hosting dashboard), then put the server's URL in *Backend API URL*.
6. **Expo project** – `cd mobile`, then `SHOP=<id> npx eas-cli init` (PowerShell: `$env:SHOP='<id>'; npx eas-cli init`) and copy the printed project id into *Expo projectId* (set *Expo owner* to your Expo account first).
7. **Build** – once the checklist shows no problems: panel → *Start EAS build*, or `npm run shop -- build <id> production android`.
8. **Web admin site (optional)** – deploy `mobile/` to Vercel with the environment variable `SHOP=<id>`.

Never change a shop's id or Android package after it is published: they identify the app on the Play Store.
