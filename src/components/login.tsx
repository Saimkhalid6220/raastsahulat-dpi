"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { demoPassword } from "@/lib/fixtures";
import { Brand, Icon, Notice } from "./shared";

const accounts = [
  ["Citizen", "citizen"], ["Helper", "helper"], ["Officer", "officer"], ["Admin", "admin"], ["Auditor", "auditor"],
] as const;

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signIn("credentials", { email, password, redirect: false, redirectTo: "/" });
      if (result?.ok && !result.error) {
        router.replace("/");
        router.refresh();
      } else setError("These demo credentials could not sign in. Choose a demo role below.");
    } catch {
      setError("The demo sign-in service is unavailable. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <header className="topbar login-top"><Brand /><Link className="plain-button" href="/api-docs"><Icon name="claim" size={18} /> API documentation</Link></header>
    <main id="main" className="login-main">
      <div className="login-story">
        <div className="story-mark"><Icon name="shield" size={64} /></div>
        <p className="eyebrow">Relief access &amp; fraud protection</p>
        <h1>Safer relief.<br />Clearer decisions.</h1>
        <p className="story-copy">Apply for emergency relief, check a suspicious message, or review a case that needs a human decision.</p>
        <div className="story-features"><span><Icon name="consent" size={19} /> Consent controls</span><span><Icon name="globe" size={19} /> English and اردو</span></div>
      </div>
      <div className="login-form-wrap">
        <div className="login-form">
          <h2>Sign in to the demo</h2>
          <p className="muted">Choose a demo role to fill in its credentials.</p>
          <form onSubmit={submit} className="form-stack">
            <label>Demo email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required /></label>
            <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
            {error && <Notice tone="danger">{error}</Notice>}
            <button className="button primary wide" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          <div className="demo-roles" aria-label="Demo roles">
            {accounts.map(([label, account]) => <button className={email === `${account}@demo.pk` ? "demo-role selected" : "demo-role"} key={account} onClick={() => { setEmail(`${account}@demo.pk`); setPassword(demoPassword); setError(""); }}>{label}</button>)}
          </div>
        </div>
      </div>
    </main>
  </>;
}
