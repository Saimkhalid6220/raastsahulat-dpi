import nodemailer from "nodemailer";

export async function sendCitizenWelcomeEmail(email: string, token: string, origin: string) {
  const sender = process.env.GMAIL_USER?.trim();
  const password = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  const localPort = Number(process.env.RAAST_LOCAL_MAIL_PORT);
  const localMail = Number.isInteger(localPort) && localPort > 0 && localPort <= 65535;
  if (!localMail && (process.env.RAAST_ALLOW_PERSONAL_SIGNUP === "false" || !sender || !password)) return false;

  const transport = nodemailer.createTransport({
    ...(localMail
      ? { host: "127.0.0.1", port: localPort, secure: false, ignoreTLS: true }
      : { service: "gmail", auth: { user: sender, pass: password } }),
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 8000,
  });

  try {
    const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
    const base = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? (vercelHost ? `https://${vercelHost}` : localMail ? origin : undefined);
    if (!base) return false;
    const url = new URL("/verify-email", base);
    url.searchParams.set("token", token);
    const result = await transport.sendMail({
      from: { name: "RaastSahulat", address: sender || "welcome@raastsahulat.example" },
      to: { address: email, name: "" },
      subject: "Verify your RaastSahulat email",
      text: `Welcome to RaastSahulat. Confirm your email using this link within 24 hours:\n\n${url.href}\n\nYou can sign in with your email or CNIC and password. The portal uses synthetic relief data and documents.`,
    });
    return result.accepted.length > 0;
  } catch {
    console.warn("RaastSahulat could not send the citizen welcome email.");
    return false;
  } finally {
    transport.close();
  }
}
