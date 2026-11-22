import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyCitizenEmail } from "@/lib/citizenSignup";

export const metadata: Metadata = { title: "Verify your email", referrer: "no-referrer" };

async function confirmEmail(form: FormData) {
  "use server";
  const verified = await verifyCitizenEmail(form.get("token"));
  redirect(verified ? "/verify-email?status=verified" : "/verify-email?status=invalid");
}

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string; status?: string }> }) {
  const { token, status } = await searchParams;
  const canConfirm = typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
  return <main className="login-main">
    <div className="login-form-wrap">
      <div className="login-form stack">
        <h1>{status === "verified" ? "Email verified" : "Verify your email"}</h1>
        {status === "verified" ? <p>Your RaastSahulat email address is confirmed.</p> : canConfirm
          ? <form action={confirmEmail}>
            <input type="hidden" name="token" value={token} />
            <button className="button primary">Confirm email address</button>
          </form>
          : <p>This verification link is invalid, expired, or already used.</p>}
        <Link href="/login" className="button">Go to sign in</Link>
      </div>
    </div>
  </main>;
}
