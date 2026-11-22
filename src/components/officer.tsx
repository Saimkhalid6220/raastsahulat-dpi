"use client";

import { useState, type FormEvent } from "react";
import { LoadingIndicator, ResourceLoading } from "./loading";
import { errorText, formatDate, money, Notice, Panel, percent, reasonLabel, request, Status, useResource, Workspace, type CaseItem, type NavItem } from "./shared";

type Detail = CaseItem & {
  document?: { cnic?: string; name?: string; documentFixture?: string; ocrConfidence?: number; tamperScore?: number; qrValid?: boolean; source?: string; scanIssue?: string };
  auditorTrace?: { inputs?: { rawNameScore?: number; nameScore?: number; cnicMatches?: boolean; nadraOnline?: boolean } };
  officerReview?: { decision: string; notes: string };
};
const nav: NavItem[] = [{ id: "queue", label: "Review queue", icon: "queue" }, { id: "scam", label: "Scam reviews", icon: "message" }];

type ScamReview = { _id: string; channel: string; rawContent: string; senderHeader?: string; redFlags: string[]; confidence: number };

function ScamReviewQueue() {
  const queue = useResource<{ reports: ScamReview[] }>("/api/scam-check/review");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function finish(id: string, verdict: string) {
    setBusy(true); setError("");
    try {
      await request("/api/scam-check/review", "PATCH", { id, verdict });
      queue.refresh();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }
  return <Panel title="Scam reports awaiting review">
    <ResourceLoading resource={queue} label="Loading scam reports…" />
    {(queue.error || error) && <Notice tone="danger">{queue.error || error}</Notice>}
    {queue.data?.reports.length === 0 && <p className="muted">No pending scam reports.</p>}
    <div className="list">{queue.data?.reports.map((report) => <div key={report._id} className="list-item">
      <div><strong>{reasonLabel(report.channel)} · {percent(report.confidence)} confidence</strong><p>{report.senderHeader && `${report.senderHeader} · `}{report.rawContent}</p>
        <small>{report.redFlags.map(reasonLabel).join(" · ")}</small></div>
      <div className="row">{[["SCAM", "Confirm scam"], ["LEGITIMATE", "Mark verified"], ["UNSURE", "Keep unverified"]].map(([verdict, label]) =>
        <button key={verdict} type="button" className="button" disabled={busy || queue.loading} onClick={() => void finish(report._id, verdict)}>{label}</button>)}</div>
    </div>)}</div>
  </Panel>;
}

export default function Officer() {
  const [screen, setScreen] = useState("queue");
  const [resolved, setResolved] = useState(false);
  const queue = useResource<{ cases: CaseItem[] }>(resolved ? "/api/cases?view=resolved" : "/api/cases");
  const staff = useResource<{ currentOfficerId: string; officers: { id: string; name: string }[] }>("/api/cases/officers");
  const [detail, setDetail] = useState<Detail>();
  const [notes, setNotes] = useState("");
  const [action, setAction] = useState("APPROVE");
  const [officerId, setOfficerId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activity, setActivity] = useState("");
  const busy = Boolean(activity);

  async function inspect(id: string) {
    setActivity("Loading case…"); setError(""); setMessage(""); setNotes(""); setAction("APPROVE"); setOfficerId("");
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

  async function manage(change: { action: "ASSIGN"; officerId: string } | { action: "CLOSE" }) {
    if (!detail) return;
    setActivity(change.action === "CLOSE" ? "Closing case…" : "Assigning case…"); setError(""); setMessage("");
    try {
      const updated = await request<Pick<CaseItem, "status" | "assignedOfficerId" | "closedAt" | "closedOutcome">>(`/api/cases/${detail.id}`, "PUT", change);
      setDetail({ ...detail, ...updated });
      setMessage(change.action === "CLOSE" ? "Case closed." : "Case assigned.");
      queue.refresh();
    } catch (failure) { setError(errorText(failure)); }
    finally { setActivity(""); }
  }

  const flags = detail?.decision?.reasons ?? [];
  const assigned = staff.data?.officers.find((officer) => officer.id === detail?.assignedOfficerId);
  const canManage = staff.data && (!assigned || assigned.id === staff.data.currentOfficerId);
  const reviewable = detail?.status === "ESCALATED_HUMAN" && canManage;
  return <Workspace role="Officer" active={screen} nav={nav} onNavigate={(next) => { setScreen(next); setDetail(undefined); }}>
    {screen === "scam" ? <ScamReviewQueue /> : <>
    <div className="page-heading"><div><h1>Review queue</h1><p className="muted">Escalated cases appear first, with the lowest confidence at the top.</p></div><button className="button" disabled={queue.loading} onClick={queue.refresh}>Refresh queue</button></div>
    <div className="row"><button className="button" aria-pressed={!resolved} onClick={() => { setResolved(false); setDetail(undefined); }}>Open cases</button><button className="button" aria-pressed={resolved} onClick={() => { setResolved(true); setDetail(undefined); }}>Resolved cases</button></div>
    {(error || queue.error || staff.error) && <Notice tone="danger">{error || queue.error || staff.error}</Notice>}
    {message && <Notice tone="success">{message}</Notice>}
    {activity && <LoadingIndicator label={activity} />}
    {detail && <div className="grid-2">
      <Panel title={detail.caseNumber} action={<Status value={detail.status} />}>
        <div className="stack">
          <div className={`document-preview ${detail.document?.documentFixture === "BLURRY" ? "blurry" : ""}`}>
            <strong>Synthetic identity sample</strong>
            <span>{detail.document?.name || "Name unavailable"}</span>
            <span>{detail.document?.cnic || "ID unavailable"}</span>
            <small>{reasonLabel(detail.document?.scanIssue ?? detail.document?.documentFixture ?? detail.document?.source ?? "No document attached")}</small>
          </div>
          <div className="split-row"><span>OCR {percent(detail.document?.ocrConfidence)}</span><span>Tamper {percent(detail.document?.tamperScore)}</span><span>QR {detail.document?.qrValid ? "valid" : "unverified"}</span></div>
          <div className="split-row"><span>Name match {percent(detail.auditorTrace?.inputs?.rawNameScore)}</span><span>Phonetic match {percent(detail.auditorTrace?.inputs?.nameScore)}</span></div>
          <p>{detail.decision?.en}</p>
          {flags.length > 0 && <ul className="list-disc pl-5">{flags.map((flag) => <li key={flag}>{reasonLabel(flag)}</li>)}</ul>}
        </div>
      </Panel>
      <Panel title="Officer decision">
        <div className="stack"><div className="split-row"><strong>{money(detail.amount)}</strong><span className="muted">Policy version {detail.ruleVersion ?? "unavailable"}</span></div>
          <ResourceLoading resource={staff} label="Loading officers…" />
          <p>Assigned to {assigned?.name ?? (detail.assignedOfficerId ? "unavailable officer" : "no officer")}</p>
          {canManage && ["ESCALATED_HUMAN", "NEEDS_MORE_PROOF"].includes(detail.status) && <div className="row">
            <label>Assign officer<select value={officerId || assigned?.id || staff.data?.currentOfficerId} onChange={(event) => setOfficerId(event.target.value)}>
              {staff.data?.officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.name}</option>)}
            </select></label>
            <button className="button" disabled={busy} onClick={() => void manage({ action: "ASSIGN", officerId: officerId || assigned?.id || staff.data!.currentOfficerId })}>Assign case</button>
          </div>}
          {reviewable && <form className="form-stack" onSubmit={review}>
            <label>Decision<select value={action} onChange={(event) => setAction(event.target.value)}><option value="APPROVE">Approve</option><option value="REJECT">Reject</option><option value="REQUEST_MORE_PROOF">Request more proof</option></select></label>
            <label>Review notes<textarea required minLength={5} maxLength={300} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
            <button className="button primary" disabled={busy}>Record decision</button>
          </form>}
          {detail.officerReview && <p>{detail.officerReview.notes}</p>}
          {detail.transactionId && <p>Mock transaction <strong>{detail.transactionId}</strong></p>}
          {detail.paymentError && <Notice>{reasonLabel(detail.paymentError)}</Notice>}
          {detail.status === "NEEDS_MORE_PROOF" && <Notice>Waiting for the citizen to submit additional proof.</Notice>}
          {canManage && ["HUMAN_REJECTED", "DISBURSED"].includes(detail.status) && <button className="button" disabled={busy} onClick={() => void manage({ action: "CLOSE" })}>Close case</button>}
          {detail.closedAt && <p>Closed {formatDate(detail.closedAt)} · {reasonLabel(detail.closedOutcome ?? detail.status)}</p>}
          {["AUTO_APPROVED", "HUMAN_APPROVED"].includes(detail.status) && <button className="button primary" disabled={busy} onClick={() => void retry()}>Retry mock transfer</button>}
        </div>
      </Panel>
    </div>}
    <Panel title={resolved ? "Resolved cases" : "Cases awaiting action"}>
      <ResourceLoading resource={queue} label="Loading cases…" refreshLabel="Updating queue…" />
      {queue.data && (queue.data.cases.length === 0 ? <p className="muted">No cases require action.</p> : <div className="table-wrap"><table>
        <thead><tr><th>Case</th><th>Status</th><th>Confidence</th><th>Amount</th><th>Review</th></tr></thead>
        <tbody>{queue.data.cases.map((record) => <tr key={record.id}><td><strong>{record.caseNumber}</strong><br /><small>{formatDate(record.createdAt)}</small></td><td><Status value={record.status} /></td><td>{percent(record.decision?.confidence)}</td><td>{money(record.amount)}</td><td><button className="button" disabled={busy} onClick={() => void inspect(record.id)}>Inspect <span className="sr-only">{record.caseNumber}</span></button></td></tr>)}</tbody>
      </table></div>)}
    </Panel>
    </>}
  </Workspace>;
}
