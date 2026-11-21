# RaastSahulat

RaastSahulat is an unofficial hackathon prototype for emergency relief case routing and scam detection. Use synthetic records, sample messages, and a dedicated demo database.

## Run locally

Use Node.js 22 and a MongoDB replica set or Atlas demo database. Set these values in `.env.local`.

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/raastsahulat_demo?replicaSet=rs0
AUTH_SECRET=replace-with-a-random-secret
AUTH_TRUST_HOST=true
```

Generate a secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Then run:

```sh
npm install
npm run seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in using a demo role button or one of the accounts below.

| Role | Demo account | Workspace |
| --- | --- | --- |
| Citizen | `citizen@demo.pk` | `/portal` |
| Helper | `helper@demo.pk` | `/helper` |
| Officer | `officer@demo.pk` | `/officer` |
| Admin | `admin@demo.pk` | `/admin` |
| Auditor | `auditor@demo.pk` | `/auditor` |

The shared demo password is `Demo@1234`. Synthetic families use PIN `1234` and demo consent code `246810`. The initial API key is `raastsahulat-synthetic-demo-key` and can be rotated from the admin workspace. Use the interactive explorer at `/api-docs` or load the OpenAPI 3.1 JSON at `/api/openapi`.

The seed defines 40 helper-linked households, 160 initial grants, 15 historical cases, and 12 labeled scam examples. Reseeding preserves withdrawn consent. Synthetic CNICs begin with `00000`, phone values use `DEMO-PHONE-`, and Raast IDs use `MOCK-RAAST-`.

## Architecture and decision policy

Next.js 16 uses the App Router, TypeScript, and Tailwind CSS 4. The project uses webpack for development and builds on Windows. Eight Mongoose models live in dedicated files under `src/models/`, and server consumers access them through `src/lib/db.ts`. Auth.js v5 uses a JWT session. The server rechecks active tenant membership and role when it handles protected routes.

Identity, registry, and transfers are deterministic mocks. Mock OCR and QR readings come from the selected scan fixture. The browser compresses optional sample images to WebP for local preview. Speech input and playback use the browser's English and Urdu speech APIs. The demo consent code and synthetic records exercise shared-device flows, and IndexedDB queues applications by helper and family while offline.

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

The seed and test commands start disposable loopback MongoDB replicas. Set `MONGOMS_SYSTEM_BINARY` to an existing MongoDB 7 executable to use it instead of downloading the test binary. The Playwright smoke suite uses Microsoft Edge on Windows by default. Set `PLAYWRIGHT_CHANNEL` to use another installed Chromium channel, or install Playwright Chromium on other platforms.

## Five-minute walkthrough

1. In the citizen portal, submit the **Blurry sample** and play the explanation. Check the prefilled demo SMS.
2. In the officer queue, inspect the escalated case, add notes, and approve it to record a mock transaction.
3. Return to the citizen workspace and withdraw identity consent. In the auditor workspace, inspect the redacted decision trace and the withdrawal event.
4. In the helper workspace, unlock two households. Disconnect, queue an application, and reconnect to sync it.
5. In the rule studio, run the Digital Twin, publish a version, and try the mock NADRA outage toggle.
