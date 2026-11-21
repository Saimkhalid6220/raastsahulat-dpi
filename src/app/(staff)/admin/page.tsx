import Admin from "@/components/admin";
import { pageActor } from "@/lib/pageAccess";
export default async function AdminPage() {
  await pageActor("ADMIN");
  return <Admin />;
}
