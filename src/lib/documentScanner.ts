import { createHmac, timingSafeEqual } from "node:crypto";
import jsQR from "jsqr";
import QRCode from "qrcode";
import sharp from "sharp";
import { syntheticNames } from "./fixtures";
import type { ScanFixture } from "./syntheticScan";

const width = 820;
const height = 340;
const digitX = 32;
const digitY = 158;
const cell = 5;
const digitStride = 30;
const qrX = 510;
const qrY = 36;
const qrSize = 276;
const cnicPattern = /^00000\d{8}$/;
const glyphs = [
  "01110100011001110101110011000101110", "00100011000010000100001000010001110",
  "01110100010000100010001000100011111", "11110000010000101110000010000111110",
  "00010001100101010010111110001000010", "11111100001111000001000011000101110",
  "00110010001000011110100011000101110", "11111000010001000100010000100001000",
  "01110100011000101110100011000101110", "01110100011000101111000010001001100",
];

function signedTicket(cnic: string, name: string) {
  const key = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!key) throw new Error("Set AUTH_SECRET before issuing synthetic document samples.");
  const ticket = `RS1|${cnic}|${name}`;
  const signature = createHmac("sha256", key).update(ticket).digest("hex").slice(0, 24);
  return `${ticket}|${signature}`;
}

function readTicket(ticket?: string) {
  const [version, cnic, name, signature, extra] = ticket?.split("|") ?? [];
  if (version !== "RS1" || extra !== undefined || !cnicPattern.test(cnic ?? "") || !syntheticNames.some((value) => value === name) || !/^[a-f0-9]{24}$/.test(signature ?? "")) return null;
  return timingSafeEqual(Buffer.from(ticket!), Buffer.from(signedTicket(cnic, name))) ? { cnic, name } : null;
}

export async function renderSyntheticCard(cnic: string, name: string, variant: ScanFixture) {
  const printed = variant === "TAMPERED" ? cnic.slice(0, -1) + ((Number(cnic.at(-1)) + 1) % 10) : cnic;
  const digits = [...printed].flatMap((digit, index) => [...glyphs[Number(digit)]].map((pixel, offset) => pixel === "1"
    ? `<rect x="${digitX + index * digitStride + offset % 5 * cell}" y="${digitY + Math.floor(offset / 5) * cell}" width="${cell}" height="${cell}"/>` : "")).join("");
  const card = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="white"/><rect x="12" y="12" width="796" height="316" rx="10" fill="none" stroke="#183f33" stroke-width="4"/>
    <g fill="#183f33" font-family="sans-serif"><text x="32" y="65" font-size="25">RaastSahulat · Synthetic identity</text>
    <text x="32" y="105" font-size="23">${name}</text><text x="32" y="142" font-size="16">Synthetic CNIC</text>
    <text x="32" y="292" font-size="16">Prototype only · No real identity data</text></g>
    <g fill="black">${digits}</g></svg>`);
  const qr = await QRCode.toBuffer(signedTicket(cnic, name), { width: qrSize, margin: 4, errorCorrectionLevel: "M" });
  const rendered = await sharp(card).composite([{ input: qr, left: qrX, top: qrY }]).png().toBuffer();
  const image = variant === "BLURRY" ? await sharp(rendered).blur(4.5).png().toBuffer() : rendered;
  return image.toString("base64");
}

function readPrintedCnic(pixels: Buffer) {
  let cnic = "";
  let confidence = 1;
  for (let index = 0; index < 13; index++) {
    const readings = Array.from({ length: 35 }, (_, offset) => {
      const x = digitX + index * digitStride + offset % 5 * cell + 1;
      const y = digitY + Math.floor(offset / 5) * cell + 1;
      let sum = 0;
      for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) sum += pixels[(y + row) * width + x + column];
      }
      return 1 - sum / (9 * 255);
    });
    const matches = glyphs.map((glyph, digit) => ({ digit, error: readings.reduce((sum, ink, offset) => sum + Math.abs(ink - Number(glyph[offset])), 0) / 35 }))
      .sort((a, b) => a.error - b.error);
    cnic += matches[0].digit;
    confidence = Math.min(confidence, 1 - matches[0].error, 0.75 + 2 * (matches[1].error - matches[0].error));
  }
  return { cnic, confidence: Math.round(confidence * 1000) / 1000 };
}

const unreadable = { ocrConfidence: 0, tamperScore: 0, qrValid: false, source: "IMAGE_SCAN", scanIssue: "UNREADABLE_IMAGE" };

export async function scanDocument(image: string) {
  const encoded = Buffer.from(image, "base64");
  try {
    const document = sharp(encoded, { limitInputPixels: 4_000_000 });
    const { format, width: inputWidth, height: inputHeight } = await document.metadata();
    if (!inputWidth || !inputHeight || !format || !["png", "jpeg", "webp"].includes(format)) return unreadable;
    const normalized = await document.autoOrient().resize(width, height, { fit: "fill" }).flatten({ background: "#ffffff" }).png().toBuffer();
    const [gray, qrPixels] = await Promise.all([
      sharp(normalized).greyscale().raw().toBuffer(),
      sharp(normalized).extract({ left: qrX, top: qrY, width: qrSize, height: qrSize }).toColourspace("srgb").ensureAlpha().raw().toBuffer(),
    ]);
    const printed = readPrintedCnic(gray);
    const qr = jsQR(new Uint8ClampedArray(qrPixels), qrSize, qrSize, { inversionAttempts: "dontInvert" });
    const ticket = readTicket(qr?.data);
    const matches = cnicPattern.test(printed.cnic) && ticket?.cnic === printed.cnic;
    const clear = printed.confidence >= 0.92;
    const mismatch = clear && Boolean(ticket) && !matches;
    return {
      source: "IMAGE_SCAN", ocrConfidence: printed.confidence, qrValid: Boolean(ticket && matches && clear),
      tamperScore: mismatch ? 0.9 : 0,
      ...(ticket && clear && matches ? { cnic: printed.cnic, name: ticket.name } : {}),
      scanIssue: mismatch ? "PRINTED_CNIC_QR_MISMATCH" : !clear ? "UNREADABLE_IMAGE" : !ticket ? "UNVERIFIED_QR" : undefined,
    };
  } catch {
    return unreadable;
  }
}
