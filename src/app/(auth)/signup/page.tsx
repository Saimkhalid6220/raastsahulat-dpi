import Login from "@/components/login";
import { connection } from "next/server";

export default async function SignupPage() {
  await connection();
  return <Login signup personalSignup={process.env.RAAST_ALLOW_PERSONAL_SIGNUP !== "false"} />;
}
