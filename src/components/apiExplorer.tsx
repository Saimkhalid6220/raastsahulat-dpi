"use client";

import { useState, type FormEvent } from "react";
import { Spinner } from "./loading";
import Link from "next/link";
import { openapi } from "@/lib/openapi";
import { Brand, Notice, Panel } from "./shared";

type Operation = {
  summary: string;
  requestBody?: { content: { "application/json": { schema: { $ref: string } } } };
  security?: Array<Record<string, unknown>>;
  responses: Record<string, { description: string }>;
};
const methods = new Set(["get", "post", "patch", "delete"]);
const operations = Object.entries(openapi.paths).flatMap(([path, definitions]) =>
  Object.entries(definitions).filter(([method]) => methods.has(method))
    .map(([method, definition]) => ({ path, method: method.toUpperCase(), definition: definition as Operation })),
);
const examples: Record<string, unknown> = {
  Claim: { citizenId: "0123456789abcdef01234567", requestedAmountPKR: 7000, draft: true, idempotencyKey: "synthetic-demo-01" },
  Consent: { scope: "NADRA_IDENTITY" },
  Review: { decision: "REQUEST_MORE_PROOF", notes: "Please attach a clearer synthetic sample." },
  ScamCheck: { channel: "SMS", senderHeader: "8171-HELP", rawContent: "Urgent! Pay a fee at https://sample.example.invalid" },
  Config: { nadraOffline: true },
  Policy: { maxAutoApprovePKR: 12000, minAutoConfidence: 0.92, maxAutoRiskScore: 0.15, maxHouseholdIncomePKR: 35000,
    requireWidowOrDisabled: true, allowedDistricts: ["Karachi", "Badin"], changeNote: "Synthetic demo policy" },
  Payment: { caseNumber: "RS-2026-DEMO-01" },
  CitizenRef: { citizenId: "0123456789abcdef01234567" },
  Nadra: { citizenId: "0123456789abcdef01234567", cnic: "0000000000001", name: "Amina Bibi" },
  Delegation: { citizenId: "0123456789abcdef01234567", pin: "1234", otp: "246810" },
  AccountChange: { action: "set-active", userId: "0123456789abcdef01234567", active: true },
};
const schemaName = (definition: Operation) => definition.requestBody?.content["application/json"].schema.$ref.split("/").at(-1);

export default function ApiExplorer() {
  const [selection, setSelection] = useState(1);
  const [data, setData] = useState("{}");
  const [recordId, setRecordId] = useState("");
  const [key, setKey] = useState("");
  const [response, setResponse] = useState<{ status: number; body: string }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { path, method, definition } = operations[selection];
  const schema = schemaName(definition);
  const needsKey = definition.security?.some((scheme) => "ApiKey" in scheme);
  const hasId = path.includes("{id}");

  async function execute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setResponse(undefined);
    try {
      if (schema) JSON.parse(data);
      const result = await fetch(path.replace("{id}", encodeURIComponent(recordId)), {
        method,
        headers: { ...(schema ? { "Content-Type": "application/json" } : {}), ...(needsKey && key ? { "x-api-key": key } : {}) },
        ...(schema ? { body: data } : {}),
      });
      const payload = await result.json();
      setResponse({ status: result.status, body: JSON.stringify(payload, null, 2) });
    } catch (failure) { setError(failure instanceof SyntaxError ? "Enter a valid JSON request." : "The demo API could not be reached."); }
    finally { setBusy(false); }
  }
  return <>
    <header className="topbar"><Brand /><Link className="button" href="/api/openapi">OpenAPI JSON</Link></header>
    <main className="api-wrap" id="main">
      <div className="page-heading"><div><p className="eyebrow muted">OpenAPI 3.1</p><h1>API explorer</h1><p className="muted">Try an operation against the same synthetic workspace. Session endpoints use your current demo role.</p></div></div>
      <Panel title="Try a request">
        <form className="form-stack" onSubmit={execute}>
          <label>Operation<select value={selection} onChange={(event) => {
            const index = Number(event.target.value);
            setSelection(index);
            setData(JSON.stringify(examples[schemaName(operations[index].definition) ?? ""] ?? {}, null, 2));
            setError(""); setResponse(undefined);
          }}>{operations.map((item, index) => <option key={`${item.method} ${item.path}`} value={index}>{item.method} {item.path}</option>)}</select></label>
          <p className="muted">{definition.summary}</p>
          {hasId && <label>Record ID<input required pattern="[a-fA-F0-9]{24}" value={recordId} onChange={(event) => setRecordId(event.target.value)} /></label>}
          {needsKey && <label>Demo API key<input type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} /></label>}
          {schema && <label>Request JSON<textarea className="font-mono" required value={data} onChange={(event) => setData(event.target.value)} /></label>}
          <div><button className="button primary" disabled={busy}>{busy && <Spinner />}{busy ? "Waiting for response…" : "Send request"}</button></div>
          {error && <Notice tone="danger">{error}</Notice>}
        </form>
      </Panel>
      <Panel title={response ? `Response · HTTP ${response.status}` : "Documented responses"}>
        {response ? <pre aria-live="polite">{response.body}</pre> : <div className="list">{Object.entries(definition.responses).map(([code, spec]) => <div key={code} className="list-item"><strong>{code}</strong><span>{spec.description}</span></div>)}</div>}
      </Panel>
    </main>
  </>;
}
