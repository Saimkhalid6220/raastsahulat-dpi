const aliases: Record<string, string> = {
  muhammad: "mhmd", mohammad: "mhmd", mohammed: "mhmd", muhammed: "mhmd", mohd: "mhmd",
  bibi: "bb", beevi: "bb", bibiya: "bb", abdul: "abdl", abdur: "abdl",
  fatima: "ftm", fatma: "ftm", saleem: "slm", salim: "slm", khan: "khn",
  "محمد": "mhmd", "بی بی": "bb", "فاطمہ": "ftm", "سلیم": "slm", "خان": "khn",
};

export function normalizeName(name?: string | null) {
  return (name ?? "").normalize("NFKD").toLowerCase().replace(/\p{Mark}/gu, "")
    .replace(/[^\p{Letter}\s]/gu, " ").trim().replace(/\s+/gu, " ");
}

export function phoneticKey(name?: string | null) {
  return normalizeName(name).replaceAll("بی بی", "bibi").split(/\s+/).filter(Boolean)
    .map((token) => aliases[token] ?? token).join("_");
}

export function jaroWinkler(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const radius = Math.max(0, Math.floor(Math.max(left.length, right.length) / 2) - 1);
  const matchedLeft = Array<boolean>(left.length).fill(false);
  const matchedRight = Array<boolean>(right.length).fill(false);
  let matches = 0;
  for (let i = 0; i < left.length; i++) {
    for (let j = Math.max(0, i - radius); j <= Math.min(i + radius, right.length - 1); j++) {
      if (matchedRight[j] || left[i] !== right[j]) continue;
      matchedLeft[i] = matchedRight[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  const first = left.split("").filter((_, index) => matchedLeft[index]);
  const second = right.split("").filter((_, index) => matchedRight[index]);
  const swaps = first.filter((value, index) => value !== second[index]).length / 2;
  const jaro = (matches / left.length + matches / right.length + (matches - swaps) / matches) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, left.length, right.length) && left[prefix] === right[prefix]) prefix++;
  return jaro > 0.7 ? jaro + prefix * 0.1 * (1 - jaro) : jaro;
}

export function compareNames(expected: string, submitted?: string | null) {
  const rawScore = jaroWinkler(normalizeName(expected), normalizeName(submitted));
  const phoneticScore = jaroWinkler(phoneticKey(expected), phoneticKey(submitted));
  return { rawScore, phoneticScore, score: Math.max(rawScore, phoneticScore) };
}
