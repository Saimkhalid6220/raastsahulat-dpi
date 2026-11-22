# RaastSahulat

RaastSahulat is an unofficial hackathon prototype for emergency relief case routing and scam detection. Use synthetic records, sample messages, and a dedicated demo database.

## Run locally

For a rehearsal with a fresh synthetic database, run the following commands and open the loopback URL printed by the demo.

```sh
npm install
npm run build
npm run demo
```

The demo starts a disposable MongoDB replica set and seeds all five roles. Press Ctrl+C to stop it. Each launch starts with a fresh dataset.

### Keep data between runs

Use Node.js 22 and a MongoDB replica set or Atlas demo database. Set these values in `.env.local`.

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/raastsahulat_demo?replicaSet=rs0
AUTH_SECRET=replace-with-a-random-secret
AUTH_TRUST_HOST=true
```

Generate a secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`, then run the local setup commands.

```sh
npm install
npm run seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Enter an email and password manually to sign in. Citizens can also create an account using an email address they can access.

| Role | Demo account | Workspace |
| --- | --- | --- |
| Citizen | `citizen@demo.pk` | `/portal` |
| Helper | `helper@demo.pk` | `/helper` |
| Officer | `officer@demo.pk` | `/officer` |
| Admin | `admin@demo.pk` | `/admin` |
| Auditor | `auditor@demo.pk` | `/auditor` |

The shared demo password is `Demo@1234`. Synthetic families use PIN `1234` and demo consent code `246810`. The initial API key is `raastsahulat-synthetic-demo-key` and can be rotated from the admin workspace. Use the interactive explorer at `/api-docs` or load the OpenAPI 3.1 JSON at `/api/openapi`.

The seed defines 40 helper-linked households, 160 initial grants, 15 historical cases, and 12 labeled scam examples. Reseeding preserves withdrawn consent. Synthetic CNICs begin with `00000`, phone values use `DEMO-PHONE-`, and Raast IDs use `MOCK-RAAST-`.

### Citizen welcome email

Citizens register with an email address, a 13-digit CNIC, and a password. CNICs can be entered with or without dashes. Citizens can then sign in with their email or CNIC. Accounts created before CNIC signup continue to use their existing email.

Set these variables for Gmail verification email delivery.

```dotenv
GMAIL_USER=your-sender@gmail.com
GMAIL_APP_PASSWORD=your-google-app-password
AUTH_URL=https://your-app.example
```

Create an app password on the Gmail sender account after enabling 2-Step Verification. The email includes a single-use link valid for 24 hours. Sign-in remains available immediately, including if mail delivery fails. The browser tests use a local SMTP inbox. [Google app password setup](https://support.google.com/accounts/answer/185833)

Signup saves a keyed CNIC hash on the login account and creates a separate synthetic claim profile. Keep the CNIC hashing key stable. It uses `RAAST_CNIC_SECRET` when configured and otherwise uses the existing Auth.js secret. For judging, set `RAAST_ALLOW_PERSONAL_SIGNUP=false` and use a dedicated demo database. This setting requires an `@raastsahulat.example` address and a synthetic CNIC starting with `00000`, and suppresses external mail. Run `npm run migrate` to prepare the unique signup indexes in an existing database.

## Architecture and decision policy

Next.js 16 uses the App Router, TypeScript, and Tailwind CSS 4. The project uses webpack for development and builds on Windows. Eight Mongoose models live in dedicated files under `src/models/`, and server consumers access them through `src/lib/db.ts`. Auth.js v5 uses a JWT session. The server rechecks active tenant membership and role when it handles protected routes.

Identity, registry, and transfers are deterministic mocks. The citizen portal generates synthetic demo cards and accepts PNG, JPEG, or WebP uploads. A server-side reader recognizes the printed numeric ID in the demo card layout, checks the signed QR, and compares the two readings. Blurred or unsupported images stay unverified. The helper and keyed API retain deterministic fixture mode. No uploaded image bytes are stored in MongoDB. The citizen form keeps one local draft per application and retries the same submission after a disconnect. Speech input and playback use the browser's English and Urdu speech APIs. The helper workflow keeps its separate IndexedDB queue.

The loss matrix values a false approval at PKR 15,000 and a false delay at PKR 400. Automatic approval requires confidence of at least 0.92, risk no higher than 0.15, a payout of at most PKR 15,000, an online identity mock, and eligibility under the active policy. A policy can tighten those limits. Below-threshold confidence, a NADRA outage, or conflicting signals create a human-review case with bilingual explanations and a structured audit trace. The exact policy snapshot stays with the case when a newer version goes live. The Digital Twin replays those stored inputs against a draft and reports the projected difference.

## Verification

```sh
npm run verify:seed
npm run typecheck
npm run lint
npm run test:backend
npm run build
npm run test:e2e
```

The seed verification and automated tests start disposable loopback MongoDB replicas. Set `MONGOMS_SYSTEM_BINARY` to an existing MongoDB 7 executable to use it instead of downloading the test binary. The Playwright smoke suite uses Microsoft Edge on Windows by default. Set `PLAYWRIGHT_CHANNEL` to use another installed Chromium channel, or install Playwright Chromium on other platforms. Set `RAAST_E2E_PRODUCTION=1` after building to run Playwright against the production build.

## Deploy the synthetic demo

The manually deployed demo URL is [raastsahulat-dpi.vercel.app](https://raastsahulat-dpi.vercel.app/).

1. Link the repository to the Vercel demo project. Select the Next.js framework preset and Node.js 22, with the repository root as the app root. Use `npm run build` as the build command. [Vercel project linking](https://vercel.com/docs/cli/link)
2. Create a dedicated MongoDB Atlas database for synthetic fixtures. Configure the Atlas database user and network access for Vercel and the machine running the seed. [Atlas connection requirements](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/)
3. In the target Vercel environment, set `MONGODB_URI` to the Atlas URI with the demo database name in its path and set `AUTH_SECRET` to a freshly generated secret. Set `MONGOMS_DISABLE_POSTINSTALL=1` to skip downloading the test MongoDB binary during the hosted build. [Vercel environment variables](https://vercel.com/docs/environment-variables) · [Auth.js deployment settings](https://authjs.dev/getting-started/deployment)
4. Run `npm run seed` on a fresh demo database. Run `npm run migrate` against an existing demo database to label legacy document readings and create the resolved-case index. The migration can be rerun safely.
5. Deploy to an access-protected Vercel preview and grant the judges access through Vercel. The shared fixtures include an administrator account. Apply Vercel protection to the production domain too if the demo moves to that domain. [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection) · [Deployment commands](https://vercel.com/docs/cli/deploy)
6. On the deployed HTTPS URL, verify the prototype banner, citizen sign-in, the case list, and `/api/openapi`. Run the walkthrough below against the dedicated demo database.

## Five-minute walkthrough

1. In the citizen portal, preview the **Clear sample**, then try **Tampered sample** and **Blurry sample**. The blurry card has valid synthetic origins but insufficient readable evidence, so it goes to human review. Play the explanation and check the prefilled demo SMS.
2. In the officer queue, assign the escalated case and request a clearer image. In the citizen portal, add proof to that case. Approve it as the officer to record a mock transfer and close the case.
3. Return to the citizen workspace and withdraw identity consent. In the auditor workspace, inspect the redacted decision trace and the withdrawal event.
4. In the helper workspace, unlock two households. Disconnect, queue an application, and reconnect to sync it.
5. In the rule studio, run the Digital Twin, publish a version, and try the mock NADRA outage toggle.
