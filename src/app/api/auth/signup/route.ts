import { registerCitizen } from "@/lib/citizenSignup";
import { citizenSignupInput } from "@/lib/contracts";
import { api, json, readJson } from "@/lib/http";

export const runtime = "nodejs";

export const POST = (request: Request) => api(async () => {
  const { email, cnic, password } = await readJson(request, citizenSignupInput);
  return json(await registerCitizen(email, cnic, password, new URL(request.url).origin), 201);
});
