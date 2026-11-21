import Citizen from "@/components/citizen";
import { pageActor } from "@/lib/pageAccess";
export default async function CitizenPage() {
  await pageActor("CITIZEN");
  return <Citizen />;
}
