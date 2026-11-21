import Auditor from "@/components/auditor";
import { pageActor } from "@/lib/pageAccess";
export default async function AuditorPage() {
  await pageActor("AUDITOR");
  return <Auditor />;
}
