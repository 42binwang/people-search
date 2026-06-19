export function clampLimit(value: number | undefined, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.min(Math.max(Math.trunc(value), 1), max);
}

export function applyImportLimit<T>(items: T[], limit: number | undefined) {
  return typeof limit === "number" ? items.slice(0, limit) : items;
}
