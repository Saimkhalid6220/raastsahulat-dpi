export const roles = ["CITIZEN", "HELPER", "OFFICER", "ADMIN", "AUDITOR"] as const;
export type UserRole = (typeof roles)[number];
export const consentScopes = ["NADRA_IDENTITY", "BISP_POVERTY_SCORE", "RAAST_DISBURSEMENT", "HELPER_DELEGATION"] as const;
export type ConsentScope = (typeof consentScopes)[number];
export const caseStatuses = ["DRAFT", "AI_REVIEW", "AUTO_APPROVED", "NEEDS_MORE_PROOF", "ESCALATED_HUMAN", "HUMAN_APPROVED", "HUMAN_REJECTED", "DISBURSED"] as const;
export const channels = ["CITIZEN_WEB", "HELPER_OFFLINE_SYNC", "PUBLIC_API"] as const;
export const reviewDecisions = ["APPROVE", "REJECT", "REQUEST_MORE_PROOF"] as const;
export const scamChannels = ["SMS", "WHATSAPP", "DOCUMENT_IMAGE"] as const;
export const verdicts = ["SCAM", "LEGITIMATE", "UNSURE"] as const;
export interface Actor {
  id: string;
  role: UserRole;
  tenantId: string;
}
