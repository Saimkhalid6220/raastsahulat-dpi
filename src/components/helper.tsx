"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { demoPin } from "@/lib/fixtures";
import { discardClaim, queueClaim, queuedClaims, type OfflineClaim } from "@/lib/offlineQueue";
import { scanFixtures, syntheticDocument, type ScanFixture } from "@/lib/syntheticScan";
import { LoadingIndicator, LoadingSkeleton, ResourceLoading, Spinner } from "./loading";
import { errorText, money, Notice, Panel, request, RequestError, Status, useResource, Workspace, type CaseItem, type NavItem } from "./shared";

interface Family { id: string; label: string; active: boolean }
interface Unlocked { token: string; name: string; cnic: string; expires: number }
const nav: NavItem[] = [
  { id: "roster", label: "Family roster", icon: "users" }, { id: "outbox", label: "Offline outbox", icon: "queue" },
  { id: "history", label: "Submitted cases", icon: "claim" },
];

export default function Helper({ actorId }: { actorId: string }) {
  const roster = useResource<{ families: Family[] }>("/api/helper/roster");
  const history = useResource<{ cases: CaseItem[] }>("/api/cases");
  const [screen, setScreen] = useState("roster");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Family>();
  const [active, setActive] = useState<{ family: Family; access: Unlocked }>();
  const [pin, setPin] = useState("");
  const [otp, setOtp] = useState("");
  const [amount, setAmount] = useState("8000");
  const [fixture, setFixture] = useState<ScanFixture>("CLEAR");
  const [records, setRecords] = useState<OfflineClaim[] | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [online, setOnline] = useState(true);
  const activeRef = useRef(active);
  const syncing = useRef(false);
  const stored = useCallback(async () => setRecords(await queuedClaims(actorId)), [actorId]);

  const sync = useCallback(async () => {
    if (syncing.current || !navigator.onLine) return;
    syncing.current = true;
    let synced = 0;
    try {
      const pending = await queuedClaims(actorId);
      if (pending.length) setSyncingNow(true);
      for (const entry of pending) {
        const access = activeRef.current;
        const token = access?.family.id === entry.data.citizenId ? access.access.token : entry.data.delegationToken;
        try {
          await request("/api/cases", "POST", { ...entry.data, delegationToken: token });
          await discardClaim(entry.id);
          synced++;
        } catch (failure) {
          setError(failure instanceof RequestError && failure.code === "DELEGATION_REQUIRED"
            ? `Unlock ${entry.family} again to sync its saved application.` : errorText(failure));
        }
      }
      await stored();
      if (synced) setMessage(`${synced} saved ${synced === 1 ? "application synced" : "applications synced"}.`);
    } catch (failure) { setError(errorText(failure)); }
    finally { syncing.current = false; setSyncingNow(false); }
    return synced;
  }, [actorId, stored]);

  useEffect(() => {
    function connectionChanged() {
      setOnline(navigator.onLine);
      if (navigator.onLine) void sync();
    }
    window.addEventListener("online", connectionChanged);
    window.addEventListener("offline", connectionChanged);
    const initialCheck = window.setTimeout(() => {
      void stored().catch((failure) => { setError(errorText(failure)); setRecords([]); });
      connectionChanged();
    }, 0);
    return () => {
      window.clearTimeout(initialCheck);
      window.removeEventListener("online", connectionChanged);
      window.removeEventListener("offline", connectionChanged);
    };
  }, [stored, sync]);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const access = await request<Unlocked>("/api/helper/roster", "POST", { citizenId: selected.id, pin, otp });
      const session = { family: selected, access };
      activeRef.current = session;
      setActive(session); setSelected(undefined); setPin(""); setOtp("");
      if (await sync()) history.refresh();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active) return;
    setBusy(true); setMessage(""); setError("");
    const id = crypto.randomUUID();
    const data = { citizenId: active.family.id, delegationToken: active.access.token, requestedAmountPKR: Number(amount),
      extractedDocData: syntheticDocument(active.access.cnic, active.access.name, fixture), idempotencyKey: id };
    try {
      await queueClaim({ id, owner: actorId, family: active.family.label, data });
      await stored();
      if (!navigator.onLine) {
        setMessage("Application saved in the offline outbox.");
        return;
      }
      if (await sync()) history.refresh();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  const families = roster.data?.families.filter((family) => family.label.toLowerCase().includes(query.trim().toLowerCase()));
  return <Workspace role="Helper" active={screen} nav={nav} onNavigate={(value) => { setScreen(value); if (value === "history") history.refresh(); }}>
    <div className="page-heading"><div><p className="eyebrow muted">Shared device</p><h1>{nav.find(({ id }) => id === screen)?.label}</h1><p className="muted">Unlock a family with its synthetic PIN and demo consent code.</p></div><Status value={online ? "ACTIVE" : "OFFLINE"} /></div>
    {active ? <Notice tone="success"><strong>Currently acting for {active.access.name}</strong> · {active.family.label} · Consent active</Notice> : <Notice>Choose a family to start a delegated application.</Notice>}
    {(roster.error || error) && <Notice tone="danger">{roster.error || error}</Notice>}
    {message && <Notice tone="success">{message}</Notice>}
    {syncingNow && !busy && <LoadingIndicator label="Syncing saved applications…" />}
    {screen === "roster" && <div className="grid-2">
      <Panel title="Assigned families">
        <div className="stack">
          <label className="field">Search household aliases<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. 02" /></label>
          <ResourceLoading resource={roster} label="Loading assigned families…" />
          <div className="list" style={{ maxHeight: "24rem", overflowY: "auto" }}>
            {families?.map((family) => <div key={family.id} className="list-item">
              <strong>{family.label}</strong>
              <button className="button" disabled={!online || !family.active || busy} onClick={() => { setSelected(family); setPin(""); setOtp(""); setError(""); }}>Unlock <span className="sr-only">{family.label}</span></button>
            </div>)}
            {families?.length === 0 && <p className="muted">No matching household.</p>}
          </div>
        </div>
      </Panel>
      {selected ? <Panel title={`Unlock ${selected.label}`}><form className="form-stack" onSubmit={unlock}>
        <p className="muted">Use PIN {demoPin} and synthetic consent code 246810.</p>
        <label>Four-digit PIN<input autoComplete="off" inputMode="numeric" type="password" pattern="[0-9]{4}" maxLength={4} required value={pin} onChange={(event) => setPin(event.target.value)} /></label>
        <label>Demo consent code<input autoComplete="off" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value)} /></label>
        <div className="row"><button className="button primary" disabled={busy}>{busy && <Spinner />}{busy ? "Unlocking…" : "Confirm unlock"}</button><button type="button" className="button" onClick={() => setSelected(undefined)}>Cancel</button></div>
      </form></Panel> : active ? <Panel title="Create relief application"><form className="form-stack" onSubmit={submit}>
        <label>Requested amount (PKR)<input type="number" min={1} max={100000} required value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <label>Sample scan condition<select value={fixture} onChange={(event) => setFixture(event.target.value as ScanFixture)}>{scanFixtures.map((item) => <option key={item} value={item}>{item === "CLEAR" ? "Clear sample" : item === "BLURRY" ? "Blurry sample" : "Tampered sample"}</option>)}</select></label>
        <button className="button primary" disabled={busy}>{busy && <Spinner />}{busy ? "Saving application…" : online ? "Submit for this family" : "Save offline application"}</button>
      </form></Panel> : null}
    </div>}
    {screen === "outbox" && <Panel title="Offline outbox" action={<button className="button" disabled={!online || busy || syncingNow} onClick={() => { setError(""); void sync().then((count) => { if (count) history.refresh(); }); }}>Sync now</button>}>
      {records === null ? <LoadingSkeleton label="Loading offline applications…" /> :
        records.length ? records.map((record) => <div key={record.id} className="list-item"><div><strong>{record.family}</strong><small>{money(record.data.requestedAmountPKR)}</small></div><Status value="DRAFT" /></div>) : <p className="muted">The outbox is empty.</p>}
    </Panel>}
    {screen === "history" && <Panel title="Submitted cases">
      <ResourceLoading resource={history} label="Loading submitted cases…" refreshLabel="Updating submitted cases…" />
      {history.error && <Notice tone="danger">{history.error}</Notice>}
      {history.data?.cases.map((record) => <div key={record.id} className="list-item"><div><strong>{record.caseNumber}</strong><small>{money(record.amount)}</small></div><Status value={record.status} /></div>)}
    </Panel>}
  </Workspace>;
}
