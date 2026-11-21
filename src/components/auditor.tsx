"use client";

import { useState } from "react";
import { errorText, formatDate, Notice, Panel, percent, reasonLabel, request, Status, useResource, Workspace, type CaseItem, type NavItem } from "./shared";

type AuditEntry = { _id: string; sequence: number; action: string; entityId: string; entityType: string; actorRole: string; timestamp: string; hash: string; previousHash: string; metadata: unknown };
type Metrics = { evaluated: number; autoApprovalRate: number | null; humanEscalationRate: number | null; avgLatencyMs: number | null;
  scam: { samples: number; tp: number; fp: number; fn: number; tn: number; unsure: number; precision: number | null; recall: number | null; falseAlarmRate: number | null } };
type Trace = CaseItem & { auditorTrace?: unknown; ruleSnapshot?: unknown };
const nav: NavItem[] = [
  { id: "audit", label: "Audit history", icon: "queue" },
  { id: "metrics", label: "Evaluation", icon: "chart" },
  { id: "cases", label: "Decision traces", icon: "claim" },
];

function Evaluation() {
  const metrics = useResource<Metrics>("/api/audit/metrics");
  if (metrics.error) return <Notice tone="danger">{metrics.error}</Notice>;
  if (!metrics.data) return <p className="muted">Loading evaluation metrics…</p>;
  const result = metrics.data;
  const cells = [
    ["Auto-approval rate", percent(result.autoApprovalRate)], ["Human escalation rate", percent(result.humanEscalationRate)],
    ["Average evaluation latency", result.avgLatencyMs == null ? "—" : `${Math.round(result.avgLatencyMs)} ms`],
    ["Scam precision", percent(result.scam.precision)], ["Scam recall", percent(result.scam.recall)], ["False alarm rate", percent(result.scam.falseAlarmRate)],
  ];
  return <>
    <div className="metrics">{cells.map(([label, value]) => <div className="metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <Panel title="Labeled scam fixtures">
      <div className="table-wrap"><table><thead><tr><th>Fixtures</th><th>True positives</th><th>False alarms</th><th>Missed scams</th><th>Unverified</th></tr></thead>
        <tbody><tr><td>{result.scam.samples}</td><td>{result.scam.tp}</td><td>{result.scam.fp}</td><td>{result.scam.fn}</td><td>{result.scam.unsure}</td></tr></tbody>
      </table></div>
    </Panel>
  </>;
}

export default function Auditor() {
  const [screen, setScreen] = useState("audit");
  const [filter, setFilter] = useState("");
  const [before, setBefore] = useState<number>();
  const [trace, setTrace] = useState<Trace>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const audit = useResource<{ entries: AuditEntry[] }>(`/api/audit?before=${before ?? ""}`);
  const cases = useResource<{ cases: CaseItem[] }>("/api/cases");
  const term = filter.toLowerCase().trim();
  const visible = audit.data?.entries.filter((entry) => [reasonLabel(entry.action), entry.actorRole, entry.entityId].some((value) => value.toLowerCase().includes(term)));

  async function inspect(id: string) {
    setBusy(true); setError("");
    try { setTrace(await request<Trace>(`/api/audit/cases/${id}`)); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  return <Workspace role="Auditor" active={screen} nav={nav} onNavigate={(value) => { setScreen(value); setError(""); setTrace(undefined); }}>
    <div className="page-heading"><div><h1>{nav.find(({ id }) => id === screen)?.label}</h1><p className="muted">Read-only oversight for synthetic decisions, consent changes, and payments.</p></div></div>
    {error && <Notice tone="danger">{error}</Notice>}
    {trace && <Panel title={`Decision trace · ${trace.caseNumber}`} action={<button className="button" onClick={() => setTrace(undefined)}>Close trace</button>}>
      <div className="stack"><Status value={trace.status} /><details open><summary>Decision inputs and scores</summary><pre>{JSON.stringify(trace.auditorTrace ?? {}, null, 2)}</pre></details>
        <details><summary>Policy version {trace.ruleVersion ?? "—"} snapshot</summary><pre>{JSON.stringify(trace.ruleSnapshot ?? {}, null, 2)}</pre></details></div>
    </Panel>}
    {screen === "metrics" && <Evaluation />}
    {screen === "audit" && <Panel title="Immutable audit timeline" action={<button className="button" onClick={() => { setBefore(undefined); audit.refresh(); }}>Refresh timeline</button>}>
      <div className="stack">
        <label className="field">Search entries<input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="e.g. Consent revoked" /></label>
        {audit.error && <Notice tone="danger">{audit.error}</Notice>}
        {visible?.length === 0 && <p className="muted">No matching events on this page.</p>}
        <div className="list">{visible?.map((entry) => <details key={entry._id} className="audit-entry">
          <summary>{reasonLabel(entry.action)} <span className="muted">· {entry.actorRole.toLowerCase()} · {formatDate(entry.timestamp)}</span></summary>
          <div className="stack"><pre>{JSON.stringify({ sequence: entry.sequence, entityId: entry.entityId, hash: entry.hash, previousHash: entry.previousHash, metadata: entry.metadata }, null, 2)}</pre>
          {entry.entityType === "ReliefCase" && <div><button className="button" disabled={busy} onClick={() => void inspect(entry.entityId)}>Inspect decision trace</button></div>}</div>
        </details>)}</div>
        {audit.data?.entries.length === 40 && <div><button className="button" onClick={() => setBefore(audit.data?.entries.at(-1)?.sequence)}>Older entries</button></div>}
      </div>
    </Panel>}
    {screen === "cases" && <Panel title="Recorded decisions">
      {cases.error && <Notice tone="danger">{cases.error}</Notice>}
      {cases.data?.cases.filter((record) => record.decision).map((record) => <div key={record.id} className="list-item"><div><strong>{record.caseNumber}</strong><small>Policy v{record.ruleVersion ?? "—"} · {formatDate(record.createdAt)}</small></div><div className="row"><Status value={record.status} /><button className="button" disabled={busy} onClick={() => void inspect(record.id)}>Inspect trace <span className="sr-only">{record.caseNumber}</span></button></div></div>)}
    </Panel>}
  </Workspace>;
}
