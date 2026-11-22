"use client";

import { useState, useSyncExternalStore, useTransition, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/types";
import { syntheticEmailDomain } from "@/lib/fixtures";
import { Spinner } from "./loading";
import { Brand, errorText, Icon, Notice, request } from "./shared";

const accounts = [
  ["Citizen", "CITIZEN"], ["Helper", "HELPER"], ["Officer", "OFFICER"], ["Admin", "ADMIN"], ["Auditor", "AUDITOR"],
] as const;

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export default function Login({ signup = false, personalSignup = false }: { signup?: boolean; personalSignup?: boolean }) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [navigating, startNavigation] = useTransition();
  const busy = submitting || navigating;
  const [role, setRole] = useState<UserRole>();
  const [registered, setRegistered] = useState<{ emailSent: boolean }>();
  const acceptsCnic = !signup && (!role || role === "CITIZEN");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setSubmitting(true);
    setError("");
    try {
      if (signup) {
        setRegistered(await request<{ emailSent: boolean }>("/api/auth/signup", "POST", { email, cnic: form.get("cnic"), password }));
        return;
      }
      const result = await signIn("credentials", { email, password, ...(role && { role }), redirect: false, redirectTo: "/" });
      if (result?.ok && !result.error) {
        startNavigation(() => {
          router.replace("/");
          router.refresh();
        });
      } else setError("Could not sign in. Check your credentials and selected role.");
    } catch (failure) {
      setError(signup ? errorText(failure) : "The sign-in service is unavailable. Try again.");
    } finally {
      setSubmitting(false);
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
          <h2>{signup ? "Create a citizen account" : "Sign in to RaastSahulat"}</h2>
          {registered ? <div className="form-stack">
            <Notice tone={registered.emailSent ? "success" : "warning"}>
              {registered.emailSent ? "Account created. Check your inbox to verify your email." : personalSignup ? "Account created. The verification email could not be sent. You can sign in now." : "Demo account created. You can sign in now."}
            </Notice>
            <Link className="button primary wide" href="/login">Go to sign in</Link>
          </div> : <>
            <p className="muted">{signup ? personalSignup ? "Use an email address you can access." : `Use a synthetic address ending in @${syntheticEmailDomain} and a CNIC beginning with 00000.` : acceptsCnic ? "Enter your email or CNIC and password." : "Enter your account email and password."}</p>
            {!signup && <div className="demo-roles" role="group" aria-label="Account role">
              {accounts.map(([label, accountRole]) => <button
                type="button" className={role === accountRole ? "demo-role selected" : "demo-role"}
                aria-pressed={role === accountRole} key={accountRole} disabled={!ready || busy}
                onClick={() => { setRole(accountRole); setError(""); }}
              >{label}</button>)}
            </div>}
            <form method="post" onSubmit={submit} className="form-stack">
              <label>{acceptsCnic ? "Email or CNIC" : "Email address"}<input name="email" type={acceptsCnic ? "text" : "email"} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} required disabled={!ready} /></label>
              {signup && <label>CNIC<input name="cnic" type="text" inputMode="numeric" maxLength={15} pattern="[0-9]{13}|[0-9]{5}-[0-9]{7}-[0-9]" title="13 digits, with or without dashes" autoComplete="off" required disabled={!ready} /></label>}
              <label>Password<input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : undefined} maxLength={100} required disabled={!ready} /></label>
              {signup && <p className="muted">Use at least 8 characters.</p>}
              {error && <Notice tone="danger">{error}</Notice>}
              <button className="button primary wide" disabled={!ready || busy}>
                {busy && <Spinner />}
                {signup ? busy ? "Creating account…" : "Create account" : navigating ? "Opening dashboard…" : submitting ? "Signing in…" : "Sign in"}
              </button>
              <Link className="plain-button" href={signup ? "/login" : "/signup"}>{signup ? "Back to sign in" : "Create a citizen account"}</Link>
            </form>
          </>}
        </div>
      </div>
    </main>
  </>;
}
