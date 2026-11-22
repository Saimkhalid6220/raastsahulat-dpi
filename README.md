# RaastSahulat

**An emergency relief and scam protection prototype for Pakistan.**

RaastSahulat helps citizens apply for relief, check suspicious messages and synthetic documents, and understand why a case needs review. It gives officers a case queue, community helpers an offline workflow, and administrators a way to test policy changes before publishing them.

[Open the hosted demo](https://raastsahulat-dpi.vercel.app/) · [Manual test data](TEST-DATA.md) · [API explorer](https://raastsahulat-dpi.vercel.app/api-docs)

> **Hackathon prototype.** The relief records and documents are synthetic. NADRA identity checks, BISP eligibility records, and Raast transfers are simulated. Use the seeded demo accounts for judging.

## Five-minute live demo

| Time | Show | Expected result |
| --- | --- | --- |
| 0:00–0:45 | Sign in as the seeded **Citizen**. Open **Scam Shield**, select **Load demo SMS**, then **Check message**. | The fake sender and fee request are flagged as **Likely scam**, with advice in English and Urdu. |
| 0:45–2:00 | In **Apply for relief**, enter **Amina Bibi**, **PKR 7,000**, and **Blurry sample**. Submit and play the explanation. | The case goes to **Human review** and the citizen can hear why. Capture the case number. |
| 2:00–3:30 | As **Officer**, inspect the case and request more proof. As **Citizen**, reopen the same case and submit a **Clear sample**. As **Officer**, approve and close the case. | The case number stays the same and a mock transfer is recorded when payment consent is active and the mock rail is online. |
| 3:30–4:15 | As **Citizen**, withdraw **Eligibility registry** consent. As **Auditor**, inspect the same case. | The audit trail records the withdrawal and the decision trace hides the withdrawn registry inputs. |
| 4:15–5:00 | As **Admin**, open **Rule studio**, change **Maximum payout (PKR)** to **5000**, and run the **Digital Twin** with a short change note. | The simulator shows how the draft would affect replayed decisions and estimated mock payouts. |

Use separate browser profiles for the roles when presenting. Start from a fresh seed for a predictable rehearsal. For document upload, clean approval, signup, outage, and offline scenarios, follow the exact inputs in [TEST-DATA.md](TEST-DATA.md).

## Who uses it

| Role | Workspace | What they can do |
| --- | --- | --- |
| Citizen | `/portal` | Apply for relief, resume drafts, add proof, check scams, and correct or control access to synthetic profile data. |
| Helper | `/helper` | Unlock a delegated household and queue its application through a weak or interrupted connection. |
| Officer | `/officer` | Assign cases, request proof, resolve escalations, close cases, and review uncertain scam reports. |
| Admin | `/admin` | Simulate and publish policy versions, manage demo access, and toggle mock rail outages. |
| Auditor | `/auditor` | Inspect case traces, consent events, the hash-linked audit history, and labeled scam evaluation metrics. |

The seed includes **40 helper-linked households, 160 initial consent grants, 15 historical cases, and 12 labeled scam messages**. Role sign-in details are in the [test data](TEST-DATA.md#1-sign-in).

## How the decision works

1. **Collect evidence.** The server checks whether the printed ID on a synthetic card matches its signed QR. The mock identity service also compares the applicant’s name, including phonetic matches.
2. **Apply the active policy.** The confidence router combines identity, document quality, eligibility, repeat claims, and risk signals. The default policy requires at least **0.92 confidence**, at most **0.15 risk**, and a payout at or below **PKR 15,000** for automatic approval.
3. **Route uncertain cases.** Low confidence, conflicting evidence, or an unavailable mock NADRA service sends the case to an officer. Citizens receive an English or Urdu explanation. The auditor trace records the reasons, scores, and policy version. Withdrawn consent limits which protected details the auditor can inspect.
4. **Replay a proposed policy.** The Digital Twin compares a draft with stored decisions for cases it can still use under current consent. It reports projected decisions and mock payouts without publishing the draft.

Scam Shield checks messages for warning signs such as impersonation, fee requests, and requests for secrets. The document scanner supports the app’s synthetic card layout. Generate upload samples in the same environment where you test them.

## Architecture

- **Web app** — Next.js 16 App Router, TypeScript, React, Tailwind CSS, and browser speech APIs for English and Urdu guidance.
- **Data and roles** — MongoDB with Mongoose models in `src/models/`, imported through `src/lib/db.ts`. Auth.js v5 uses JWT sessions and server-side role and tenant checks.
- **Services** — Consent guards, a phonetic matcher, versioned policies, a confidence router, an append-only audit log, and mock identity, registry, and payment APIs.
- **Interfaces** — A keyed public REST endpoint and an [OpenAPI specification](https://raastsahulat-dpi.vercel.app/api/openapi). The [API explorer](https://raastsahulat-dpi.vercel.app/api-docs) supports authenticated demo calls.

## Run locally

Use Node.js 22. For a fresh rehearsal, run these commands and open the loopback URL printed by the demo.

```sh
npm ci
npm run build
npm run demo
```

The demo starts a disposable MongoDB replica set and seeds all five roles. Press **Ctrl+C** to stop it. The next launch starts with fresh data.

### Persistent demo database

Use a MongoDB replica set or a dedicated Atlas database. Set the following in `.env.local`, using a generated value for `AUTH_SECRET`.

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/raastsahulat_demo?replicaSet=rs0
AUTH_SECRET=replace-with-a-random-secret
AUTH_TRUST_HOST=true
RAAST_ALLOW_PERSONAL_SIGNUP=false
```

```sh
npm ci
npm run seed
npm run dev
```

Open [localhost:3000](http://localhost:3000). Run `npm run migrate` against an existing demo database to prepare the account indexes and label legacy document readings. Reseeding preserves withdrawals and other existing data. For the manually managed Vercel deployment, use Node.js 22, the same demo database settings, and `npm run build`. Set `MONGOMS_DISABLE_POSTINSTALL=1` if the hosted build should skip downloading the test MongoDB binary. Restrict access to hosted instances that use the shared seed accounts.

### Optional Gmail verification test

In a separate test environment, set `RAAST_ALLOW_PERSONAL_SIGNUP=true`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `AUTH_URL`. Signup accepts a CNIC with or without dashes and stores a keyed hash in the login account. Keep `RAAST_CNIC_SECRET` stable when configured. Otherwise, the app uses the Auth.js secret. The confirmation link is single-use and expires after 24 hours. Existing seed accounts use email sign-in. [Google app password setup](https://support.google.com/accounts/answer/185833)

## Verification

```sh
npm run verify:seed
npm run typecheck
npm run lint
npm run test:backend
npm run build
npm run test:e2e
```

The backend and browser tests use disposable local databases. Coverage includes duplicate CNIC signup, signup verification through a local SMTP inbox, consent withdrawal, document verdicts, case resubmission, policy replay, and repeated payout protection. For the local production build, set `RAAST_E2E_PRODUCTION=1` before running Playwright. Use `MONGOMS_SYSTEM_BINARY` to point tests at an installed MongoDB 7 executable.
