import { json } from "@/lib/http";
import { openapi } from "@/lib/openapi";
export const GET = () => json(openapi);
