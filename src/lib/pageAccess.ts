import { redirect } from "next/navigation";
import type { UserRole } from "../types";
import { requireRole } from "./auth";
import { ApiError } from "./http";

export async function pageActor(role: UserRole) {
  try {
    return await requireRole([role]);
  } catch (error) {
    if (error instanceof ApiError) redirect("/login");
    throw error;
  }
}
