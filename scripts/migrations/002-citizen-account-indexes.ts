import { User } from "../../src/lib/db";

export async function createCitizenAccountIndexes() {
  await User.createIndexes();
}
