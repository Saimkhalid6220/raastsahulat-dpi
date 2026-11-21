import { z } from "zod";
import type { Actor } from "../types";
import { logAudit } from "./auditLogger";
import type { RuleInput } from "./contracts";
import { PolicyRule, connectDB } from "./db";
import { ApiError, duplicateKey } from "./http";

export type Condition =
  | { field: "district"; operator: "equals"; value: string }
  | { field: "householdIncomePKR"; operator: "atMost"; value: number }
  | { field: "isWidowOrDisabled"; operator: "equals"; value: boolean }
  | { all: Condition[] }
  | { any: Condition[] };

const leaf = z.union([
  z.object({ field: z.literal("district"), operator: z.literal("equals"), value: z.string().min(1).max(40) }).strict(),
  z.object({ field: z.literal("householdIncomePKR"), operator: z.literal("atMost"), value: z.number().int().nonnegative() }).strict(),
  z.object({ field: z.literal("isWidowOrDisabled"), operator: z.literal("equals"), value: z.boolean() }).strict(),
]);

export function conditionSchema(depth = 0): z.ZodType<Condition> {
  if (depth >= 3) return leaf;
  const group = z.array(conditionSchema(depth + 1)).min(1).max(8);
  return z.union([leaf, z.object({ all: group }).strict(), z.object({ any: group }).strict()]);
}

export interface EligibilityInputs {
  district: string;
  householdIncomePKR: number | null;
  isWidowOrDisabled: boolean;
}
type Policy = Pick<RuleInput, "allowedDistricts" | "maxHouseholdIncomePKR" | "requireWidowOrDisabled"> & { conditions?: Condition };

function checkCondition(inputs: EligibilityInputs, node: Condition): boolean {
  if ("all" in node) return node.all.every((item) => checkCondition(inputs, item));
  if ("any" in node) return node.any.some((item) => checkCondition(inputs, item));
  if (node.field === "householdIncomePKR") return inputs.householdIncomePKR !== null && inputs.householdIncomePKR <= node.value;
  return inputs[node.field] === node.value;
}

export function eligibilityReasons(inputs: EligibilityInputs, rule: Policy) {
  const reasons: string[] = [];
  if (inputs.householdIncomePKR === null) reasons.push("INCOME_MISSING");
  else if (inputs.householdIncomePKR > rule.maxHouseholdIncomePKR) reasons.push("ABOVE_INCOME_LIMIT");
  if (rule.requireWidowOrDisabled && !inputs.isWidowOrDisabled) reasons.push("VULNERABILITY_RULE_NOT_MET");
  if (rule.allowedDistricts.length && !rule.allowedDistricts.includes(inputs.district)) reasons.push("DISTRICT_NOT_ELIGIBLE");
  if (rule.conditions && !checkCondition(inputs, rule.conditions)) reasons.push("CONDITION_TREE_NOT_MET");
  return reasons;
}

export async function activeRule(tenantId: string) {
  await connectDB();
  return PolicyRule.findOne({ tenantId, isActive: true }).sort({ version: -1, _id: -1 }).lean();
}

export async function publishRule(actor: Actor, rule: RuleInput & { conditions?: Condition }) {
  await connectDB();
  const ruleCode = "FLOOD_RELIEF_2026";
  const filter = { tenantId: actor.tenantId, ruleCode };
  for (let attempt = 0; attempt < 10; attempt++) {
    const latest = await PolicyRule.findOne(filter).sort({ version: -1 }).select("version").lean();
    const version = (latest?.version ?? 0) + 1;
    try {
      const published = await PolicyRule.create({ ...filter, ...rule, version, createdBy: actor.id });
      await PolicyRule.updateMany({ ...filter, version: { $lt: version }, isActive: true }, { isActive: false });
      await logAudit(actor, "RULE_PUBLISHED", "PolicyRule", published.id, { ruleCode, version, changeNote: rule.changeNote });
      return published.toObject();
    } catch (error) {
      if (!duplicateKey(error)) throw error;
    }
  }
  throw new ApiError(409, "RULE_PUBLISH_CONFLICT");
}
