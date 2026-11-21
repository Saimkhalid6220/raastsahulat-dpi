# RaastSahulat

RaastSahulat is a hackathon prototype for relief case routing and scam detection. Use synthetic records and a dedicated demo database. Never enter real CNICs, phone numbers, documents, or financial information.

## Phase 1 development

The Phase 1 source defines eight Mongoose collections under `src/models/`. The database entry point in `src/lib/db.ts` exports the models and shares one connection pool per process. The seed preserves existing records, including consent revocations, when rerun.

The project uses Next.js 16 with the App Router and Tailwind CSS 4.

Use Node.js 22 and an empty MongoDB demo database. Set `MONGODB_URI` in `.env.local`, for example `mongodb://127.0.0.1:27017/raastsahulat_demo`.

```sh
npm install
npm run seed
npm run seed
npm run typecheck
```

The first two seed runs against a fresh demo database should report five accounts, 40 helper-linked households, 160 active grants, 15 historical cases, and 12 labeled scam samples. Seed CNICs begin with `00000`, phone values use `DEMO-PHONE-`, and Raast IDs use `MOCK-RAAST-`.

| Demo role | Email |
| --- | --- |
| Citizen | `citizen@demo.pk` |
| Community helper | `helper@demo.pk` |
| Department officer | `officer@demo.pk` |
| Administrator | `admin@demo.pk` |
| Auditor | `auditor@demo.pk` |

All five seed accounts use `Demo@1234` and the synthetic family PIN is `1234`. These are seed fixtures. Authentication endpoints will be implemented in Phase 2.

## Delivery gates

Phase 1 requires two successful seed runs and a passing TypeScript check. Phase 2 adds Auth.js, route authorization, scoped consent checks, the mock DPI rails, and OpenAPI. Phase 3 adds routing, policy evaluation, the scam classifier, and historical simulation. The backend integration suite must pass before portal implementation begins.

The specification estimates a false approval at PKR 15,000 and a false delay at PKR 400. Automatic approval requires confidence of at least 0.92, risk no higher than 0.15, a payout of at most PKR 15,000, an online NADRA mock, and eligibility under the active rule. Below-threshold confidence and NADRA outages require human review and separate explanations for citizens and auditors.
