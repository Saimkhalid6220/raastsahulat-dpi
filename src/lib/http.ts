import { z } from "zod";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string = code) {
    super(message);
  }
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function api(handle: () => Promise<Response>) {
  try {
    return await handle();
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.code, message: error.message }, error.status);
    if (error instanceof z.ZodError) {
      return json({ error: "INVALID_INPUT", issues: error.issues.map(({ path, message }) => ({ path, message })) }, 400);
    }
    console.error("RaastSahulat request failed", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "SERVICE_UNAVAILABLE", message: "The demo service could not complete the request." }, 503);
  }
}

export async function readJson<Schema extends z.ZodTypeAny>(request: Request, schema: Schema): Promise<z.output<Schema>> {
  const origin = request.headers.get("origin");
  if (origin) {
    const url = new URL(request.url);
    const host = request.headers.get("host") ?? url.host;
    const forwardedProtocol = request.headers.get("x-forwarded-proto");
    const protocol = forwardedProtocol === "https" || forwardedProtocol === "http" ? `${forwardedProtocol}:` : url.protocol;
    if (origin !== `${protocol}//${host}`) throw new ApiError(403, "UNTRUSTED_ORIGIN");
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new ApiError(415, "JSON_REQUIRED");
  }
  const reader = request.body?.getReader();
  const buffer = new Uint8Array(15 * 1024);
  let length = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    if (length + value.byteLength > buffer.length) {
      await reader.cancel();
      throw new ApiError(413, "PAYLOAD_TOO_LARGE");
    }
    buffer.set(value, length);
    length += value.byteLength;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(buffer.subarray(0, length)));
  } catch {
    throw new ApiError(400, "INVALID_JSON");
  }
  return schema.parse(value);
}

export function duplicateKey(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
