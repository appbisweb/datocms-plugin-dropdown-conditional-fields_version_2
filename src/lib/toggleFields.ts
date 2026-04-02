import type { Rule } from "./types";

export function isFieldValueEmpty(value: unknown, depth = 0): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return true;
    if ("upload_id" in obj) {
      return obj.upload_id === null || obj.upload_id === undefined;
    }
    if (depth >= 2) return false;
    return Object.values(obj).every((v) => isFieldValueEmpty(v, depth + 1));
  }
  return false;
}

export function normalizeValue(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value.toLowerCase();
  }
  return null;
}

export function getAllManagedFields(rules: Rule[]): string[] {
  const set = new Set<string>();
  for (const rule of rules) {
    for (const field of rule.fields) {
      set.add(field);
    }
  }
  return Array.from(set);
}

export function getFieldVisibility(
  rules: Rule[],
  currentValue: string | null,
): Record<string, boolean> {
  const allFields = getAllManagedFields(rules);
  const visibility: Record<string, boolean> = {};

  for (const fieldApiKey of allFields) {
    visibility[fieldApiKey] = false;
  }

  if (currentValue === null) {
    return visibility;
  }

  const normalized = currentValue.toLowerCase();

  for (const rule of rules) {
    if (rule.value.toLowerCase() === normalized) {
      for (const fieldApiKey of rule.fields) {
        visibility[fieldApiKey] = true;
      }
    }
  }

  return visibility;
}

export function migrateLegacyParameters(
  legacy: Record<string, unknown>,
): Rule[] {
  const rules: Rule[] = [];
  for (const [value, fields] of Object.entries(legacy)) {
    if (Array.isArray(fields)) {
      rules.push({
        value,
        fields: fields.filter((f): f is string => typeof f === "string"),
      });
    }
  }
  return rules;
}
