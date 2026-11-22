"use client";

import { useState, type FormEvent } from "react";
import { LoadingIndicator, ResourceLoading } from "./loading";
import { errorText, formatDate, money, Notice, Panel, percent, reasonLabel, request, Status, useResource, Workspace, type CaseItem, type NavItem } from "./shared";

type Detail = CaseItem & {
  document?: { cnic?: string; name?: string; documentFixture?: string; ocrConfidence?: number; tamperScore?: number; qrValid?: boolean };
  auditorTrace?: { inputs?: { rawNameScore?: number; nameScore?: number; cnicMatches?: boolean; nadraOnline?: boolean } };
  officerReview?: { decision: string; notes: string };
};
const nav: NavItem[] = [{ id: "queue", label: "Review queue", icon: "queue" }];

export default function Officer() {
  const queue = useResource<{ cases: CaseItem[] }>("/api/cases");
  const [detail, setDetail] = useState<Detail>();
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState("APPROVE");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activity, setActivity] = useState("");
  const busy = Boolean(activity);

  async function inspect(id: string) {
    setActivity("Loading case…"); setError(""); setMessage(""); setNotes(""); setAction("APPROVE");
    try { setDetail(await request<Detail>(`/api/cases/${id}`)); }
    catch (failure) { setError(errorText(failure)); setDetail(undefined); }
    finally { setActivity(""); }
  }

  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    setActivity("Recording decision…"); setError("");
    try {
      const updated = await request<Detail>(`/api/cases/${detail.id}`, "PATCH", { decision: action, notes });
      setDetail({ ...detail, ...updated });
      setMessage(updated.transactionId ? "Decision recorded and mock payment sent." : "Officer decision recorded.");
      queue.refresh();
    } catch (failure) { setError(errorText(failure)); }
    finally { setActivity(""); }
  }

  async function retry() {
    if (!detail) return;
    setActivity("Sending mock transfer…"); setError("");
    try {
      await request("/api/mock/raast/disburse", "POST", { caseNumber: detail.caseNumber });
      await inspect(detail.id);
      setMessage("Demo payment recorded.");
      queue.refresh();
    } catch (failure) { setError(errorText(failure)); }
    finally { setActivity(""); }
  }

  const flags = detail?.decision?.reasons ?? [];
  const reviewable = detail && ["ESCALATED_HUMAN", "NEEDS_MORE_PROOF"].includes(detail.status);
  return <Workspace role="Officer" active="queue" nav={nav} onNavigate={() => { setDetail(undefined); }}>
    <div className="page-heading"><div><h1>Review queue</h1><p className="muted">Escalated cases appear first, with the lowest confidence at the top.</p></div><button className="button" disabled={queue.loading} onClick={queue.refresh}>Refresh queue</button></div>
    {(error || queue.error) && <Notice tone="danger">{error || queue.error}</Notice>}
    {message && <Notice tone="success">{message}</Notice>}
    {activity && <LoadingIndicator label={activity} />}
    {detail && <div className="grid-2">
      <Panel title={detail.caseNumber} action={<Status value={detail.status} />}>
        <div className="stack">
          <div className={`document-preview ${detail.document?.documentFixture === "BLURRY" ? "blurry" : ""}`}>
            <strong>Synthetic identity sample</strong>
            <span>{detail.document?.name || "Name unavailable"}</span>
            <span>{detail.document?.cnic || "ID unavailable"}</span>
            <small>{detail.document?.documentFixture ? reasonLabel(detail.document.documentFixture) : "No fixture attached"}</small>
          </div>
          <div className="split-row"><span>OCR {percent(detail.document?.ocrConfidence)}</span><span>Tamper {percent(detail.document?.tamperScore)}</span><span>QR {detail.document?.qrValid ? "valid" : "unverified"}</span></div>
          <div className="split-row"><span>Name match {percent(detail.auditorTrace?.inputs?.rawNameScore)}</span><span>Phonetic match {percent(detail.auditorTrace?.inputs?.nameScore)}</span></div>
          <p>{detail.decision?.en}</p>
          {flags.length > 0 && <ul className="list-disc pl-5">{flags.map((flag) => <li key={flag}>{reasonLabel(flag)}</li>)}</ul>}
        </div>
      </Panel>
      <Panel title="Officer decision">
        <div className="stack"><div className="split-row"><strong>{money(detail.amount)}</strong><span className="muted">Policy version {detail.ruleVersion ?? "unavailable"}</span></div>
          {reviewable && <form className="form-stack" onSubmit={review}>
            <label>Decision<select value={action} onChange={(event) => setAction(event.target.value)}><option value="APPROVE">Approve</option><option value="REJECT">Reject</option><option value="REQUEST_MORE_PROOF">Request more proof</option></select></label>
            <label>Review notes<textarea required minLength={5} maxLength={300} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            <button className="button primary" disabled={busy}>Record decision</button>
          </form>}
          {detail.officerReview && <p>{detail.officerReview.notes}</p>}
          {detail.transactionId && <p>Mock transaction <strong>{detail.transactionId}</strong></p>}
          {detail.paymentError && <Notice>{reasonLabel(detail.paymentError)}</Notice>}
          {["AUTO_APPROVED", "HUMAN_APPROVED"].includes(detail.status) && <button className="button primary" disabled={busy} onClick={() => void retry()}>Retry mock transfer</button>}
        </div>
      </Panel>
    </div>}
    <Panel title="Cases awaiting action">
      <ResourceLoading resource={queue} label="Loading cases…" refreshLabel="Updating queue…" />
      {queue.data && (queue.data.cases.length === 0 ? <p className="muted">No cases require action.</p> : <div className="table-wrap"><table>
        <thead><tr><th>Case</th><th>Status</th><th>Confidence</th><th>Amount</th><th>Review</th></tr></thead>
        <tbody>{queue.data.cases.map((record) => <tr key={record.id}><td><strong>{record.caseNumber}</strong><br /><small>{formatDate(record.createdAt)}</small></td><td><Status value={record.status} /></td><td>{percent(record.decision?.confidence)}</td><td>{money(record.amount)}</td><td><button className="button" disabled={busy} onClick={() => void inspect(record.id)}>Inspect <span className="sr-only">{record.caseNumber}</span></button></td></tr>)}</tbody>
      </table></div>)}
    </Panel>
  </Workspace>;
}
