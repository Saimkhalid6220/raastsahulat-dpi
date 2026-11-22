"use client";

import { useState, type FormEvent } from "react";
import type { RuleInput } from "@/lib/contracts";
import { LoadingIndicator, ResourceLoading } from "./loading";
import { errorText, money, Notice, Panel, request, Status, useResource, Workspace, type NavItem } from "./shared";

type Rule = RuleInput & { version: number; isActive: boolean; conditions?: unknown };
type Totals = { autoApproved: number; escalated: number; rejected: number; payoutPKR: number };
type Twin = { before: Totals; after: Totals; replayed: number; skipped: number; delta: Totals };
type Config = { nadraOffline: boolean; nadraLatencyMs: number; raastOffline: boolean; fraudSurge: boolean };
type Account = { _id: string; name: string; email: string; role: string; isActive: boolean };
const nav: NavItem[] = [
  { id: "rules", label: "Rule studio", icon: "queue" },
  { id: "rails", label: "Failure simulator", icon: "bolt" },
  { id: "accounts", label: "Accounts & keys", icon: "users" },
];

function Impact({ twin }: { twin: Twin }) {
  const fields = [["Auto-approved", "autoApproved"], ["Escalated", "escalated"], ["Rejected", "rejected"]] as const;
  return <Panel title="Digital Twin impact">
    <div className="stack">
      <p className="muted">{twin.replayed} decisions replayed · {twin.skipped} missing trace inputs</p>
      <div className="grid-2">
        {([["Current decisions", twin.before], ["Draft projection", twin.after]] as const).map(([title, stats]) => <div className="stack" key={title}>
          <h3>{title}</h3>
          {fields.map(([label, key]) => <div className="chart-row" key={key}><span>{label}</span><meter aria-label={`${title} ${label}`} min={0} max={Math.max(1, twin.replayed)} value={stats[key]} /><strong>{stats[key]}</strong></div>)}
        </div>)}
      </div>
      <div className="split-row"><strong>Projected payout change</strong><span>{twin.delta.payoutPKR > 0 ? "+" : ""}{money(twin.delta.payoutPKR)}</span></div>
    </div>
  </Panel>;
}

function RuleStudio({ live, onPublish }: { live: Rule; onPublish: (version: number) => void }) {
  const [cap, setCap] = useState(live.maxAutoApprovePKR);
  const [confidence, setConfidence] = useState(live.minAutoConfidence);
  const [risk, setRisk] = useState(live.maxAutoRiskScore);
  const [income, setIncome] = useState(live.maxHouseholdIncomePKR);
  const [districts, setDistricts] = useState(live.allowedDistricts.join(", "));
  const [required, setRequired] = useState(live.requireWidowOrDisabled);
  const [note, setNote] = useState("");
  const [conditions, setConditions] = useState(live.conditions ? JSON.stringify(live.conditions, null, 2) : "");
  const [twin, setTwin] = useState<Twin>();
  const [error, setError] = useState("");
  const [activity, setActivity] = useState("");
  const busy = Boolean(activity);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const publish = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "publish";
    setActivity(publish ? "Publishing policy…" : "Running simulation…"); setError("");
    try {
      const data = { maxAutoApprovePKR: cap, minAutoConfidence: confidence, maxAutoRiskScore: risk,
        maxHouseholdIncomePKR: income, requireWidowOrDisabled: required,
        allowedDistricts: districts.split(",").map((value) => value.trim()).filter(Boolean),
        changeNote: note.trim() || "Synthetic draft replay",
        ...(conditions.trim() ? { conditions: JSON.parse(conditions) } : {}),
      };
      if (publish) {
        if (!note.trim()) { setError("Add a change note before publishing."); return; }
        const { rule } = await request<{ rule: Rule }>("/api/rules", "POST", data);
        onPublish(rule.version);
      } else setTwin(await request<Twin>("/api/rules/simulate", "POST", data));
    } catch (failure) { setError(failure instanceof SyntaxError ? "The condition tree must contain valid JSON." : errorText(failure)); }
    finally { setActivity(""); }
  }

  return <>
    <Panel title={`Edit live rule v${live.version}`}>
      <form className="form-stack" onSubmit={submit}>
        <div className="grid-2">
          <label>Maximum payout (PKR)<input type="number" min={1} max={15000} value={cap} onChange={(event) => setCap(event.target.valueAsNumber)} required /></label>
          <label>Household income ceiling (PKR)<input type="number" min={0} max={100000} value={income} onChange={(event) => setIncome(event.target.valueAsNumber)} required /></label>
          <label>Minimum auto-approval confidence<input type="number" min={0.92} max={1} step="0.01" value={confidence} onChange={(event) => setConfidence(event.target.valueAsNumber)} required /></label>
          <label>Maximum auto-approval risk<input type="number" min={0} max={0.15} step="0.01" value={risk} onChange={(event) => setRisk(event.target.valueAsNumber)} required /></label>
        </div>
        <label>Eligible districts (comma separated)<input value={districts} onChange={(event) => setDistricts(event.target.value)} /></label>
        <label style={{ display: "flex", alignItems: "center" }}><input type="checkbox" checked={required} onChange={(event) => setRequired(event.target.checked)} /> Require widow or disability eligibility</label>
        <details><summary>Advanced condition tree</summary><label>Condition JSON<textarea placeholder={'{"field":"district","operator":"equals","value":"Badin"}'} value={conditions} onChange={(event) => setConditions(event.target.value)} /></label></details>
        <label>Change note<input value={note} maxLength={250} onChange={(event) => setNote(event.target.value)} /></label>
        {error && <Notice tone="danger">{error}</Notice>}
        {activity && <LoadingIndicator label={activity} />}
        <div className="row"><button className="button" value="simulate" disabled={busy}>Run Digital Twin simulation</button><button className="button primary" value="publish" disabled={busy}>Publish live rule v{live.version + 1}</button></div>
      </form>
    </Panel>
    {twin && <Impact twin={twin} />}
  </>;
}

function FailureControls() {
  const config = useResource<Config>("/api/mock/config");
  const [latency, setLatency] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const toggles = [["NADRA outage", "nadraOffline"], ["Raast outage", "raastOffline"], ["High fraud surge", "fraudSurge"]] as const;
  async function change(data: Partial<Config>) {
    setBusy(true); setError("");
    try { await request("/api/mock/config", "PATCH", data); config.refresh(); setMessage("Mock settings updated."); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }
  return <Panel title="Mock rail controls">
    {(config.error || error) && <Notice tone="danger">{config.error || error}</Notice>}
    {message && <Notice tone="success">{message}</Notice>}
    <ResourceLoading resource={config} label="Loading mock settings…" refreshLabel="Updating mock settings…" />
    {busy && <LoadingIndicator label="Saving mock settings…" />}
    {config.data && <div className="stack">
      <div className="list">{toggles.map(([label, key]) => <div key={key} className="list-item"><strong>{label}</strong><button className="button" aria-pressed={config.data![key]} disabled={busy} onClick={() => void change({ [key]: !config.data![key] })}>{config.data![key] ? "Enabled" : "Disabled"}<span className="sr-only"> {label}</span></button></div>)}</div>
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void change({ nadraLatencyMs: Number(latency || config.data?.nadraLatencyMs) }); }}>
        <label>Mock NADRA latency (ms)<input type="number" min={0} max={5000} value={latency || config.data.nadraLatencyMs} onChange={(event) => setLatency(event.target.value)} required /></label>
        <div><button className="button" disabled={busy}>Set mock latency</button></div>
      </form>
    </div>}
  </Panel>;
}

function Accounts() {
  const accounts = useResource<{ accounts: Account[] }>("/api/admin/accounts");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function change(data: unknown) {
    setBusy(true); setError("");
    try {
      const result = await request<{ apiKey?: string }>("/api/admin/accounts", "PATCH", data);
      if (result.apiKey) setKey(result.apiKey);
      else accounts.refresh();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }
  return <>
    <Panel title="Synthetic accounts">
      {(accounts.error || error) && <Notice tone="danger">{accounts.error || error}</Notice>}
      <ResourceLoading resource={accounts} label="Loading accounts…" refreshLabel="Updating accounts…" />
      {busy && <LoadingIndicator label="Applying account changes…" />}
      {accounts.data?.accounts.map((account) => <div key={account._id} className="list-item"><div><strong>{account.email}</strong><small>{account.role}</small></div>
        <div className="row"><Status value={account.isActive ? "ACTIVE" : "DISABLED"} />{account.role !== "ADMIN" && <button disabled={busy} className="button" onClick={() => void change({ action: "set-active", userId: account._id, active: !account.isActive })}>{account.isActive ? "Disable" : "Enable"}</button>}</div>
      </div>)}
    </Panel>
    <Panel title="External API key">
      <div className="stack"><p className="muted">Rotating the key invalidates the current demo key. The replacement appears once.</p>
        <div><button disabled={busy} className="button" onClick={() => void change({ action: "rotate-key" })}>Rotate demo API key</button></div>
        {key && <pre>{key}</pre>}
      </div>
    </Panel>
  </>;
}

export default function Admin() {
  const [screen, setScreen] = useState("rules");
  const [message, setMessage] = useState("");
  const rules = useResource<{ rules: Rule[] }>("/api/rules");
  const live = rules.data?.rules.find((rule) => rule.isActive);
  return <Workspace role="Admin" active={screen} nav={nav} onNavigate={setScreen}>
    <div className="page-heading"><div><h1>{nav.find(({ id }) => id === screen)?.label}</h1><p className="muted">{screen === "rules" ? "Replay a draft against historical decisions before publishing it live." : screen === "rails" ? "Test how applications behave when mock services fail." : "Manage access to the synthetic workspace."}</p></div></div>
    {screen === "rules" && <>
      {rules.error && <Notice tone="danger">{rules.error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <ResourceLoading resource={rules} label="Loading active policy…" refreshLabel="Updating policy…" />
      {live && <RuleStudio key={live.version} live={live} onPublish={(version) => { setMessage(`Policy v${version} is live.`); rules.refresh(); }} />}
      {rules.data && !live && <p className="muted">There is no active policy.</p>}
      {rules.data && <Panel title="Version history">{rules.data.rules.map((rule) => <div className="list-item" key={rule.version}><div><strong>Policy v{rule.version}</strong><small>{rule.changeNote}</small></div><Status value={rule.isActive ? "ACTIVE" : "ARCHIVED"} /></div>)}</Panel>}
    </>}
    {screen === "rails" && <FailureControls />}
    {screen === "accounts" && <Accounts />}
  </Workspace>;
}
