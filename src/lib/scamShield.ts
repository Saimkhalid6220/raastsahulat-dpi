import type { z } from "zod";
import type { scamInput } from "./contracts";
export type ScamInput = z.output<typeof scamInput>;

export function classifyDocument(scan: { tamperScore: number; qrValid: boolean; ocrConfidence: number; scanIssue?: string }) {
  const verdict = scan.tamperScore > 0.25 ? "SCAM" : scan.qrValid ? "LEGITIMATE" : "UNSURE";
  return {
    verdict, redFlags: scan.scanIssue ? [scan.scanIssue] : [],
    confidence: scan.ocrConfidence,
    simpleAdviceEn: verdict === "SCAM" ? "The printed ID differs from the signed demo QR. Ask an officer to review it before relying on the document."
      : verdict === "LEGITIMATE" ? "The printed ID matches the signed synthetic QR."
        : "We could not verify the synthetic document. Ask an officer to review it or try a clearer image.",
    simpleAdviceUr: verdict === "SCAM" ? "چھپا ہوا شناختی نمبر ڈیمو کیو آر سے مختلف ہے۔ دستاویز استعمال کرنے سے پہلے افسر سے جانچ کرائیں۔"
      : verdict === "LEGITIMATE" ? "چھپا ہوا شناختی نمبر تصدیق شدہ فرضی کیو آر سے ملتا ہے۔"
        : "فرضی دستاویز کی تصدیق نہیں ہو سکی۔ افسر سے رجوع کریں یا واضح تصویر آزمائیں۔",
  } as const;
}

export function classifyScam({ rawContent, senderHeader }: ScamInput) {
  const checks = [
    { hit: /(?:8171|raast)/i.test(senderHeader ?? "") && !/^(8171|RAAST)$/i.test(senderHeader ?? ""), flag: "IMPERSONATED_SENDER" },
    { hit: /(?:pay|send|deposit).{0,36}(?:fee|charges)|فیس.{0,26}(?:ادا|بھیج)/iu.test(rawContent), flag: "UPFRONT_FEE" },
    { hit: /(?:send|share|confirm|enter|reply).{0,28}(?:OTP|PIN|password)|(?:پن|رمز).{0,26}بھیج/iu.test(rawContent), flag: "SECRET_REQUEST" },
    { hit: /(?:https?:\/\/|www\.|bit\.ly|tinyurl\.com)/i.test(rawContent), flag: "UNVERIFIED_LINK" },
    { hit: /(?:urgent|immediately|expires today|فوری)/i.test(rawContent), flag: "URGENCY" },
  ];
  const redFlags = checks.filter(({ hit }) => hit).map(({ flag }) => flag);
  const severe = redFlags.some((flag) => ["UPFRONT_FEE", "SECRET_REQUEST", "IMPERSONATED_SENDER"].includes(flag));
  const known = /^(8171|RAAST)$/i.test(senderHeader ?? "") && /\bdemo\b|\bmock\b/i.test(rawContent);
  const verdict = severe ? "SCAM" as const : known && !redFlags.length ? "LEGITIMATE" as const : "UNSURE" as const;
  return {
    verdict, redFlags, confidence: severe ? Math.min(0.99, 0.88 + redFlags.length * 0.03) : verdict === "LEGITIMATE" ? 0.92 : 0.5,
    simpleAdviceEn: verdict === "SCAM" ? "Do not pay, open links, or share a PIN. Verify the message in your demo portal."
      : verdict === "UNSURE" ? "We could not verify this message. Check with a trusted officer before acting."
        : "This matches a known demo message. Confirm the update in your portal.",
    simpleAdviceUr: verdict === "SCAM" ? "رقم ادا نہ کریں، لنک نہ کھولیں اور پن نہ دیں۔ ڈیمو پورٹل میں تصدیق کریں۔"
      : verdict === "UNSURE" ? "پیغام کی تصدیق نہیں ہو سکی۔ کوئی قدم اٹھانے سے پہلے افسر سے پوچھیں۔"
        : "یہ ایک ڈیمو پیغام سے ملتا ہے۔ پورٹل میں اس کی تصدیق کریں۔",
  };
}

export function sanitizeMessage(text: string) {
  return text.replace(/https?:\/\/[^\s]+|www\.[^\s]+/gi, "[demo link redacted]")
    .replace(/(?:\+?\d[\d .()-]{7,}\d)/g, "[number redacted]");
}
