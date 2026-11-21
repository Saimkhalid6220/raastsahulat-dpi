import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt);
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function hashPassword(value: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await derive(value, salt, 32) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}
export async function verifyPassword(value: string, stored: string) {
  const [salt, digest] = stored.split(":");
  if (!salt || !digest || !/^[a-f0-9]{64}$/.test(digest)) return false;
  const derived = await derive(value, salt, 32) as Buffer;
  return timingSafeEqual(Buffer.from(digest, "hex"), derived);
}
