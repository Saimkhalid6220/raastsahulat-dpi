export const scanFixtures = ["CLEAR", "BLURRY", "TAMPERED"] as const;
export type ScanFixture = (typeof scanFixtures)[number];

export function syntheticDocument(cnic: string, name: string, documentFixture: ScanFixture) {
  return {
    cnic, name, documentFixture,
    ocrConfidence: documentFixture === "BLURRY" ? 0.52 : 0.99,
    tamperScore: documentFixture === "TAMPERED" ? 0.9 : 0,
    qrValid: documentFixture !== "TAMPERED",
  };
}

export async function compressImage(file: File) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a synthetic PNG, JPEG, or WebP.");
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image preview is unavailable.");
    let scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    for (const quality of [0.8, 0.65, 0.5, 0.4, 0.3]) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (blob && blob.size < 250000) return blob;
      scale *= 0.75;
    }
    throw new Error("Try a smaller synthetic image.");
  } finally {
    bitmap.close();
  }
}
