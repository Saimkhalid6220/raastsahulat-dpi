import { registerCitizen } from "@/lib/citizenSignup";
import { citizenSignupInput } from "@/lib/contracts";
import { api, json, readJson } from "@/lib/http";

export const runtime = "nodejs";

export const POST = (request: Request) => api(async () => {
  const { email, password } = await readJson(request, citizenSignupInput);
  return json(await registerCitizen(email, password), 201);
});
