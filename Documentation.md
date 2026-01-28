
# Codepack — Project Documentation

## **Project Overview**
- **Purpose:** Codepack is a Next.js-based admin/dashboard starter with a reusable UI component library, Firebase integration, Tailwind styling, and TypeScript support. It provides common admin features (dashboards, auth, shops/operations management) so teams can focus on business logic.
- **Primary audience:** Frontend developers building admin panels, internal tools, or multi-role dashboards (admin, superadmin, manager).
- **Key goals:** fast developer onboarding, modular UI components, consistent styling, and easy deployment.

## **Features**
- **Next.js 16** app with server/client components where appropriate.
- **Reusable UI component library** in `components/ui/` (Radix + Tailwind + custom primitives).
- **Firebase integration** located at `lib/firebase/config.js` for authentication and data.
- **Tailwind CSS** for utility-first styling and animation helpers.
- **Pre-wired pages** for various user roles under `app/` (admin, superadmin, manager, dashboard, login, etc.).

## **Tech Stack**
- **Framework:** Next.js 16
- **Libraries:** React 19, Radix UI, Tailwind CSS, Firebase, Zod, React Hook Form
- **Language:** JavaScript + TypeScript types (mix depending on file)
- **Linting/Dev tools:** ESLint, Tailwind

## **Repository Structure**
- **`app/`**: Next.js app directory containing route pages and role-specific dashboards.
- **`components/ui/`**: Component library (buttons, inputs, dialogs, tables, etc.).
- **`lib/`**: Utilities and integrations (e.g., `lib/firebase/config.js`).
- **`hooks/`**: Custom hooks like `use-mobile.tsx`.
- **`public/`**: Static assets.
- **Top-level config:** `tailwind.config.js`, `next.config.ts`, `tsconfig.json`, `package.json`.

Example key files:
- `app/layout.js` — global app layout
- `app/globals.css` — Tailwind imports and global styles
- `components/ui/button.tsx` — base button primitive
- `lib/firebase/config.js` — Firebase initialization

## **Prerequisites**
- Node.js (v18 or newer recommended)
- npm (or yarn/pnpm)
- A Firebase project (for auth / DB) if using the Firebase integration.

## **Getting Started (Development)**
1. Clone the repository:

```
git clone <repo-url>
cd codepack
```

2. Install dependencies:

```
npm install
```

3. Create a `.env.local` file in the project root and add required environment variables. Example (replace with your values):

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

4. Start the development server:

```
npm run dev
```

Visit `http://localhost:3000` to view the app.

## **Available npm Scripts**
- **`dev`**: `next dev` — runs the dev server.
- **`build`**: `next build` — builds for production.
- **`start`**: `next start` — runs the production server.
- **`lint`**: `eslint` — run eslint (configure args as needed).

These are defined in `package.json`.

## **Development Workflow & Conventions**
- Use feature branches named descriptively: `feat/<feature>`, `fix/<issue>`, `chore/<task>`.
- Commit messages: short imperative summary, optionally with a ticket id.
- Component development:
	- Add primitives to `components/ui/` and export them from an index file if needed.
	- Keep components small and composable.
- Styling:
	- Use Tailwind utility classes.
	- For variants and class composition, prefer `class-variance-authority` or `clsx` for conditional classes.

## **Testing, Linting, Formatting**
- Linting: Run `npm run lint`. ESLint is installed as a devDependency. Configure rules in your local `.eslintrc` or the top-level config.
- Unit/Integration tests: None included by default. Recommended: add Jest + React Testing Library or Vitest.

## **Firebase integration**
- The firebase initialization is in `lib/firebase/config.js`. Ensure `.env.local` has the `NEXT_PUBLIC_FIREBASE_*` vars.
- For auth flows, use `react-firebase-hooks` or Firebase SDK directly. Be careful to keep server-only secrets out of client bundles.

## **Building & Deployment**
- Build for production:

```
npm run build
```

- Start production server locally:

```
npm run start
```

- Recommended hosting: Vercel (native Next.js support) or any hosting that supports Node/Next.js apps. Configure your environment variables in the hosting provider's dashboard.

## **Environment Variables**
- Keep all public-facing keys prefixed with `NEXT_PUBLIC_` if they must be exposed to the browser.
- Server-only secrets should be stored without `NEXT_PUBLIC_` and only referenced on the server side.

## **Components and How to Use Them**
- The `components/ui/` folder contains pre-built UI primitives that rely on Radix and Tailwind. Common patterns:
	- `button.tsx` — use for primary actions
	- `input.tsx` / `textarea.tsx` — form elements
	- `dialog.tsx` / `popover.tsx` — overlays
	- `table.tsx` — data tables and pagination helpers

Import example:

```
import { Button } from '../components/ui/button'

<Button variant="primary">Save</Button>
```

## **Troubleshooting & FAQ**
- Dev server failing to start:
	- Ensure Node and npm versions are compatible.
	- Remove `node_modules` and reinstall: `rm -rf node_modules package-lock.json && npm install`.
- ESLint errors:
	- Run `npm run lint` and fix errors. Add `.eslintignore` for files to exclude.
- Missing environment variables:
	- Check `.env.local` and your hosting environment configuration.

## **Contributing**
- Fork the repo and open a pull request against `main` (or the main development branch).
- Include descriptive commit messages and a short PR description with what you changed and why.
- Add or update tests for new behavior.

## **Roadmap / Next Improvements**
- Add automated tests (unit/e2e).
- Add CI pipeline (GitHub Actions) for lint/build/tests.
- Add Storybook for component development and visual testing.

## **License**
- Add your project's license here (e.g., MIT). If this repository is for internal use, note that instead.

## **Contact / Maintainers**
- List maintainers or team contacts and preferred communication channels (e.g., Slack, email).

---

If you'd like, I can also:
- add a `CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` file,
- scaffold GitHub Actions for linting and builds, or
- add a minimal Jest/Vitest setup for component tests.


