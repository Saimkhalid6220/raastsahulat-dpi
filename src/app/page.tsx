import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { portalByRole } from "@/lib/auth.config";

export default async function Index() {
  const session = await auth();
  redirect(session?.user.role ? portalByRole[session.user.role] : "/login");
}
