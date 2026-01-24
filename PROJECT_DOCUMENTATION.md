KM Electronics — Business Dashboard

Comprehensive inventory and sales dashboard built with Next.js (App Router) and Firebase Firestore. Includes real-time stock updates, reporting (PDF/Excel), and role-based access for admins, managers and data entry users.

Key features
- Real-time inventory (`stocks`) and sales (`sales`) views using Firestore `onSnapshot`
- Location-based stock analytics and sales analytics
- PDF and Excel export for reports (`jspdf`, `jspdf-autotable`, `xlsx`)
- Role-based access and authentication using Firebase Authentication

Tech stack
- Next.js 16 (App Router)
- React 19
- Firebase (Firestore, Auth, Storage)
- Tailwind CSS
- jspdf, jspdf-autotable, xlsx for reporting

Quick start (local)
Prerequisites: Node 18+, npm

1. Install dependencies
```bash
npm install
```
2. Create Firebase project and enable Firestore + Authentication
3. Add environment variables (see below)
4. Run development server
```bash
npm run dev
```

Open http://localhost:3000 and sign in as an admin to access the dashboard.

Environment variables
Set these in your local `.env` or in Vercel project settings (Production & Preview):

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Notes:
- These are public Firebase config values (safe to use as NEXT_PUBLIC). Do NOT add service account keys to the client.

Firebase security rules (recommended)
- Ensure Firestore rules allow authenticated reads/writes necessary for admin roles. For example, `stocks` and `sales` collections must allow reads for authenticated admin/manager users.

Production build & run
```bash
npm run build
npm run start
```

Deploy to Vercel
1. Connect your repository in Vercel.
2. Add the environment variables listed above under Project → Settings → Environment Variables.
3. Use default build command (`npm run build`) and `npm start` for production preview. Vercel automatically handles Next.js builds.

Real-time listeners & auth
- `app/shops/page.jsx` is a client component (`'use client'`) and initializes real-time `onSnapshot` listeners when a signed-in `user` is present. In production make sure:
  - Users authenticate properly (so `user` is not `null`).
  - Firestore rules permit the authenticated user to read `stocks` and `sales`.

If you see no real-time updates in production but manual `Refresh` works, check authentication state and Firestore rules.

Important files
- `app/shops/page.jsx` — main inventory & sales dashboard (real-time listeners, reports)
- `app/lib/firebase/config.js` — Firebase client initialization and helpers
- `components/ui/` — UI components used across the app (buttons, inputs, cards, etc.)
- `app/login/page.js` — authentication & user creation
- `Documentation.md` — detailed procedural notes and code snippets used in the app

Troubleshooting
- Blank page or Firebase errors on load: verify env vars in Vercel and check browser console for `firebase` init errors.
- Permission errors on real-time listeners: review Firestore rules.
- Items not showing after update: confirm `isActive` is `true` and updates write `quantity`/`updatedAt` fields.

Testing real-time updates
1. Sign in as an admin in the running app (local or deployed).
2. Update a stock item (via admin UI or Firestore console) — change `quantity` or `isActive`.
3. Confirm `app/shops` view updates automatically. If not, check browser console for permission or network errors.

Contributing
- Fork the repo, create a feature branch, add tests where applicable, and open a PR. Follow existing code style and component conventions.

License & contact
- MIT (or update as needed)
- For questions contact the maintainer: KM Electronics / COD3PACK

---

Next steps you might want me to take:
- Add a `DEPLOY.md` with step-by-step Vercel instructions and screenshots
- Open a small PR that ensures CI runs `npm run build` on PRs
- Update `README.md` instead of adding a separate file (I can do that if preferred)
