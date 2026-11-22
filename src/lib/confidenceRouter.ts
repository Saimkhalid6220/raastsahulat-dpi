import { eligibilityReasons, type Condition, type EligibilityInputs } from "./ruleEngine";

export interface ConfidenceInputs extends EligibilityInputs {
  amount: number;
  nadraOnline: boolean;
  nadraReason?: string;
  cnicMatches: boolean;
  nameScore: number;
  rawNameScore: number;
  ocrConfidence: number;
  tamperScore: number;
  qrValid: boolean;
  repeatedClaim: boolean;
  fraudSurge: boolean;
  additionalProof?: boolean;
}

export interface RouterPolicy {
  maxAutoApprovePKR: number;
  minAutoConfidence: number;
  maxAutoRiskScore: number;
  maxHouseholdIncomePKR: number;
  requireWidowOrDisabled: boolean;
  allowedDistricts: string[];
  conditions?: Condition;
}

const round = (value: number) => Math.round(Math.max(0, Math.min(value, 1)) * 10000) / 10000;

export function routeConfidence(inputs: ConfidenceInputs, rule: RouterPolicy | null) {
  const confidence = round(inputs.nadraOnline && inputs.cnicMatches
    ? Math.min(inputs.nameScore, inputs.ocrConfidence, 0.45 * inputs.nameScore + 0.45 * inputs.ocrConfidence + 0.1 * Number(inputs.qrValid))
    : 0);
  const riskScore = round(0.55 * inputs.tamperScore + 0.55 * Number(inputs.repeatedClaim)
    + 0.45 * Number(inputs.fraudSurge) + 0.3 * Number(inputs.nadraOnline && !inputs.cnicMatches)
    + 0.18 * Number(!inputs.qrValid));
  const rejected = rule ? eligibilityReasons(inputs, rule) : ["NO_ACTIVE_RULE"];
  const uncertaintyReasons = [...rejected];
  if (inputs.additionalProof) uncertaintyReasons.push("ADDITIONAL_PROOF_REVIEW");
  if (!inputs.nadraOnline) uncertaintyReasons.push(inputs.nadraReason ?? "NADRA_UNAVAILABLE");
  else if (!inputs.cnicMatches) uncertaintyReasons.push("CNIC_MISSING_OR_MISMATCH");
  if (inputs.ocrConfidence < 0.8) uncertaintyReasons.push("BLURRY_OR_MISSING_DOCUMENT");
  if (inputs.nadraOnline && inputs.cnicMatches && inputs.rawNameScore >= 0.7 && inputs.rawNameScore <= 0.85) {
    uncertaintyReasons.push("BORDERLINE_NAME_MATCH");
  }
  if (inputs.repeatedClaim) uncertaintyReasons.push("DUPLICATE_CNIC_WITHIN_30_DAYS");
  if (!inputs.qrValid) uncertaintyReasons.push("QR_MISSING_OR_INVALID");
  if (inputs.tamperScore > 0.25) uncertaintyReasons.push("DOCUMENT_TAMPER_SIGNAL");
  if (inputs.fraudSurge) uncertaintyReasons.push("MOCK_FRAUD_SURGE");
  if (confidence < Math.max(0.92, rule?.minAutoConfidence ?? 0.92)) uncertaintyReasons.push("BELOW_CONFIDENCE_THRESHOLD");
  if (riskScore > Math.min(0.15, rule?.maxAutoRiskScore ?? 0.15)) uncertaintyReasons.push("ABOVE_RISK_THRESHOLD");
  if (inputs.amount > Math.min(15000, rule?.maxAutoApprovePKR ?? 15000)) uncertaintyReasons.push("ABOVE_PAYOUT_CAP");
  const action = uncertaintyReasons.length ? "ESCALATED_HUMAN" as const : "AUTO_APPROVED" as const;

  const citizenExplanationEn = action === "AUTO_APPROVED"
    ? "Your synthetic identity and eligibility checks passed. Your demo payment can proceed."
    : !inputs.nadraOnline
      ? "I am not sure because the mock identity service is unavailable. An officer will review your application."
      : uncertaintyReasons.includes("BLURRY_OR_MISSING_DOCUMENT")
        ? "I am not sure the document is clear. An officer will review your application, and a clearer sample may help."
        : "I am not sure your application can be approved automatically. An officer will review the flagged checks.";
  const citizenExplanationUr = action === "AUTO_APPROVED"
    ? "فرضی شناخت اور اہلیت کی جانچ مکمل ہو گئی ہے۔ ڈیمو ادائیگی آگے بڑھ سکتی ہے۔"
    : !inputs.nadraOnline
      ? "فرضی شناختی سروس دستیاب نہیں ہے۔ ایک افسر آپ کی درخواست دیکھے گا۔"
      : uncertaintyReasons.includes("BLURRY_OR_MISSING_DOCUMENT")
        ? "مجھے یقین نہیں کہ دستاویز واضح ہے۔ ایک افسر درخواست دیکھے گا، اور واضح نمونہ مدد کر سکتا ہے۔"
        : "مجھے خودکار منظوری پر یقین نہیں ہے۔ ایک افسر نشان زدہ معلومات کا جائزہ لے گا۔";
  return {
    action, confidence, riskScore, uncertaintyReasons, eligibilityFailures: rejected,
    citizenExplanationEn, citizenExplanationUr, ttsScript: { en: citizenExplanationEn, ur: citizenExplanationUr },
  };
}
