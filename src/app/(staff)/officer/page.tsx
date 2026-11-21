import Officer from "@/components/officer";
import { pageActor } from "@/lib/pageAccess";
export default async function OfficerPage() {
  await pageActor("OFFICER");
  return <Officer />;
}
