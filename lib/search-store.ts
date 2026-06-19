import { randomUUID } from "crypto";

export type SearchMode = "name" | "phone" | "address";

export type SearchPayload =
  | {
      mode: "name";
      firstName: string;
      lastName: string;
      city: string;
      state: string;
    }
  | {
      mode: "phone";
      phone: string;
    }
  | {
      mode: "address";
      street: string;
      city: string;
      state: string;
      zip: string;
    };

export type StoredSearch = {
  token: string;
  createdAt: number;
  payload: SearchPayload;
};

declare global {
  var peopleSearchStore: Map<string, StoredSearch> | undefined;
}

const ttlMs = 1000 * 60 * 30;

function store() {
  globalThis.peopleSearchStore ??= new Map<string, StoredSearch>();
  return globalThis.peopleSearchStore;
}

export function createStoredSearch(payload: SearchPayload) {
  cleanupExpiredSearches();
  const token = `s_${randomUUID().replaceAll("-", "")}`;
  store().set(token, {
    token,
    createdAt: Date.now(),
    payload,
  });
  return token;
}

export function getStoredSearch(token: string) {
  cleanupExpiredSearches();
  return store().get(token);
}

function cleanupExpiredSearches() {
  const now = Date.now();
  for (const [token, value] of store()) {
    if (now - value.createdAt > ttlMs) {
      store().delete(token);
    }
  }
}

export function cleanText(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
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
