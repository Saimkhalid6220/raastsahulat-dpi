import nodemailer from "nodemailer";

export async function sendCitizenWelcomeEmail(email: string) {
  const sender = process.env.GMAIL_USER?.trim();
  const password = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  const localPort = Number(process.env.RAAST_LOCAL_MAIL_PORT);
  const localMail = Number.isInteger(localPort) && localPort > 0 && localPort <= 65535;
  if (!localMail && (!sender || !password)) return false;

  const transport = nodemailer.createTransport({
    ...(localMail
      ? { host: "127.0.0.1", port: localPort, secure: false, ignoreTLS: true }
      : { service: "gmail", auth: { user: sender, pass: password } }),
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 8000,
  });

  try {
    const result = await transport.sendMail({
      from: { name: "RaastSahulat", address: sender || "welcome@raastsahulat.example" },
      to: { address: email, name: "" },
      subject: "Welcome to RaastSahulat",
      text: "Your RaastSahulat citizen account is ready. Sign in with the email address and password you used when you registered. The portal uses synthetic relief data and documents.",
    });
    return result.accepted.length > 0;
  } catch {
    console.warn("RaastSahulat could not send the citizen welcome email.");
    return false;
  } finally {
    transport.close();
  }
}
