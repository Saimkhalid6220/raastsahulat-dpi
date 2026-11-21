import Helper from "@/components/helper";
import { pageActor } from "@/lib/pageAccess";
export default async function HelperPage() {
  const actor = await pageActor("HELPER");
  return <Helper actorId={actor.id} />;
}
