import Citizen from "@/components/citizen";
import { CitizenProfile } from "@/lib/db";
import { pageActor } from "@/lib/pageAccess";
export default async function CitizenPage() {
  const actor = await pageActor("CITIZEN");
  const profile = await CitizenProfile.findOne({ userId: actor.id })
    .select("fullNameRaw assignedHelperId").lean();
  return <Citizen fixture={profile ? { storageId: profile._id.toString(), name: profile.fullNameRaw } : null}
    hasHelper={Boolean(profile?.assignedHelperId)} />;
}
