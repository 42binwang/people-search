export function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeName(value: string) {
  return normalizeText(value);
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return "";
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeAddress(parts: {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
}) {
  return normalizeText(
    [parts.street, parts.city, parts.state, parts.zip].filter(Boolean).join(" "),
  );
}

export function escapeSqlLike(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!local || !domain) {
    return value;
  }
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(3, local.length - 2))}@${domain}`;
}
