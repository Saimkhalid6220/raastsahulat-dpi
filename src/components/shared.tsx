"use client";

import { signOut } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";

const shapes = {
  shield: "M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10z M9 12l2 2 4-4",
  home: "M3 10l9-7 9 7v10H3z M9 20v-7h6v7",
  claim: "M6 3h9l4 4v14H6z M14 3v5h5 M9 13h7 M9 17h7",
  message: "M4 5h16v12H9l-5 4z M8 9h8 M8 13h5",
  consent: "M6 10h12v11H6z M8 10V7a4 4 0 118 0v3 M12 14v3",
  users: "M15 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M21 21v-2a4 4 0 00-3-4 M17 3a4 4 0 010 8",
  queue: "M4 5h16 M4 12h16 M4 19h16 M8 3v4 M15 10v4 M10 17v4",
  chart: "M3 3v18h18 M8 16v-4 M13 16V8 M18 16V5",
  bolt: "M13 2l-9 12h7l-1 8 10-12h-7z",
  info: "M12 22a10 10 0 100-20 10 10 0 000 20z M12 11v6 M12 7v.1",
  voice: "M12 2a3 3 0 013 3v6a3 3 0 11-6 0V5a3 3 0 013-3z M5 10v1a7 7 0 0014 0v-1 M12 18v4",
  audio: "M3 9h4l5-4v14l-5-4H3z M16 9a5 5 0 010 6 M19 6a9 9 0 010 12",
  check: "M4 12l5 5L20 6",
  signout: "M10 4H4v16h6 M9 12h12 M17 8l4 4-4 4",
  globe: "M12 22a10 10 0 100-20 10 10 0 000 20z M2 12h20 M12 2c5 5 5 15 0 20-5-5-5-15 0-20z",
} as const;

export type IconName = keyof typeof shapes;
export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={shapes[name]} /></svg>;
}

export function Brand() {
  return <Link className="brand" href="/"><span className="brand-symbol"><Icon name="shield" size={25} /></span><span>RaastSahulat</span></Link>;
}

export type NavItem = { id: string; label: string; icon: IconName };
export function Workspace({ role, active, nav, onNavigate, children }: {
  role: string; active: string; nav: NavItem[]; onNavigate: (id: string) => void; children: ReactNode;
}) {
  const [lite, setLite] = useState(false);
  return <div className={lite ? "workspace lite" : "workspace"}>
    <header className="topbar">
      <Brand />
      <div className="top-actions">
        <button className="plain-button" aria-pressed={lite} onClick={() => setLite(!lite)}><Icon name="bolt" size={17} /> <span>2G Lite {lite ? "on" : "off"}</span></button>
        <button className="plain-button" onClick={() => void signOut({ redirectTo: "/login" })}><Icon name="signout" size={17} /> <span>Sign out</span></button>
      </div>
    </header>
    <div className="workspace-body">
      <aside className="sidebar">
        <p className="sidebar-label">{role} workspace</p>
        <nav aria-label={`${role} workspace`}>
          {nav.map((item) => <button key={item.id} className={active === item.id ? "nav-button active" : "nav-button"} aria-current={active === item.id ? "page" : undefined} onClick={() => onNavigate(item.id)}><Icon name={item.icon} size={19} />{item.label}</button>)}
        </nav>
        <Link className="sidebar-link" href="/api-docs"><Icon name="claim" size={18} /> API documentation</Link>
      </aside>
      <main className="workspace-content" id="main">{children}</main>
    </div>
  </div>;
}

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <section className="panel"><div className="panel-heading"><h2>{title}</h2>{action}</div>{children}</section>;
}
export function Notice({ children, tone = "warning" }: { children: ReactNode; tone?: "warning" | "danger" | "success" }) {
  return <div className={`notice ${tone}`} role={tone === "danger" ? "alert" : "status"}><Icon name={tone === "success" ? "check" : "info"} size={20} /><div>{children}</div></div>;
}

export class RequestError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}
export async function request<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
    cache: "no-store",
  });
  const body = await response.json();
  if (!response.ok) throw new RequestError(body.error || "REQUEST_FAILED", body.message || body.error || "Request failed", response.status);
  return body as T;
}

export function errorText(error: unknown) {
  if (error instanceof RequestError) return error.message.replaceAll("_", " ");
  return "The demo service could not be reached. Please try again.";
}
export function useResource<T>(path: string) {
  const [settled, setSettled] = useState<{ path: string; revision: number; data: T | null; error: string }>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    void request<T>(path)
      .then((data) => { if (active) setSettled({ path, revision, data, error: "" }); })
      .catch((failure) => {
        if (active) setSettled((previous) => ({ path, revision, data: previous?.data ?? null, error: errorText(failure) }));
      });
    return () => { active = false; };
  }, [path, revision]);
  const loading = !settled || settled.path !== path || settled.revision !== revision;
  return { data: settled?.data ?? null, error: loading ? "" : settled.error, loading, refresh: () => setRevision((current) => current + 1) };
}

export type CaseItem = {
  id: string; caseNumber: string; status: string; amount: number; citizenId: string; createdAt?: string;
  ruleVersion?: number; transactionId?: string; paymentError?: string;
  assignedOfficerId?: string; closedAt?: string; closedOutcome?: string;
  decision?: { action: string; confidence: number; riskScore: number; reasons: string[]; en: string; ur: string };
};
export const statusLabels: Record<string, string> = {
  DRAFT: "Draft", AI_REVIEW: "Evaluating", AUTO_APPROVED: "Approved · payment pending",
  NEEDS_MORE_PROOF: "More proof requested", ESCALATED_HUMAN: "Human review",
  HUMAN_APPROVED: "Approved · payment pending", HUMAN_REJECTED: "Declined", DISBURSED: "Demo payment sent",
  CLOSED: "Closed",
  ACTIVE: "Active", REVOKED: "Withdrawn", SCAM: "Likely scam", LEGITIMATE: "Known demo message", UNSURE: "Unverified",
};
export function Status({ value }: { value: string }) {
  const tone = ["DISBURSED", "ACTIVE", "LEGITIMATE"].includes(value) ? "good" :
    ["HUMAN_REJECTED", "REVOKED", "SCAM"].includes(value) ? "bad" : value === "DRAFT" ? "neutral" : "review";
  return <span className={`status ${tone}`}>{statusLabels[value] ?? value.replaceAll("_", " ")}</span>;
}

export const money = (amount: number) => `PKR ${new Intl.NumberFormat("en-PK").format(amount)}`;
export const percent = (value?: number | null) => value == null ? "—" : `${(value * 100).toFixed(0)}%`;
export const formatDate = (value?: string) => value ? new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" }).format(new Date(value)) : "—";
export const reasonLabel = (reason: string) => reason.toLowerCase().replaceAll("_", " ").replace(/^./, (first) => first.toUpperCase());
export function listen(text: string, lang: "en" | "ur") {
  if (!("speechSynthesis" in window)) return false;
  const speech = new SpeechSynthesisUtterance(text);
  speech.lang = lang === "ur" ? "ur-PK" : "en-PK";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(speech);
  return true;
}
