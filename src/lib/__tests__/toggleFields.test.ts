import { describe, it, expect } from "vitest";
import {
  normalizeValue,
  getAllManagedFields,
  getFieldVisibility,
  migrateLegacyParameters,
} from "../toggleFields";
import type { Rule } from "../types";

describe("normalizeValue", () => {
  it("lowercases a string", () => {
    expect(normalizeValue("Hello")).toBe("hello");
  });

  it("returns null for empty string", () => {
    expect(normalizeValue("")).toBeNull();
  });

  it("returns null for null", () => {
    expect(normalizeValue(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(normalizeValue(undefined)).toBeNull();
  });

  it("returns null for non-string types", () => {
    expect(normalizeValue(42)).toBeNull();
    expect(normalizeValue(true)).toBeNull();
  });
});

describe("getAllManagedFields", () => {
  it("returns unique field keys across all rules", () => {
    const rules: Rule[] = [
      { value: "a", fields: ["title", "body"] },
      { value: "b", fields: ["body", "image"] },
    ];
    const result = getAllManagedFields(rules);
    expect(result).toEqual(["title", "body", "image"]);
  });

  it("returns empty array for no rules", () => {
    expect(getAllManagedFields([])).toEqual([]);
  });

  it("handles rules with empty fields", () => {
    const rules: Rule[] = [{ value: "a", fields: [] }];
    expect(getAllManagedFields(rules)).toEqual([]);
  });
});

describe("getFieldVisibility", () => {
  const rules: Rule[] = [
    { value: "option_a", fields: ["title", "description"] },
    { value: "option_b", fields: ["price", "availability"] },
  ];

  it("shows correct fields for option_a", () => {
    const result = getFieldVisibility(rules, "option_a");
    expect(result).toEqual({
      title: true,
      description: true,
      price: false,
      availability: false,
    });
  });

  it("shows correct fields for option_b", () => {
    const result = getFieldVisibility(rules, "option_b");
    expect(result).toEqual({
      title: false,
      description: false,
      price: true,
      availability: true,
    });
  });

  it("hides all fields when value is null", () => {
    const result = getFieldVisibility(rules, null);
    expect(result).toEqual({
      title: false,
      description: false,
      price: false,
      availability: false,
    });
  });

  it("hides all fields for an unknown value", () => {
    const result = getFieldVisibility(rules, "unknown");
    expect(result).toEqual({
      title: false,
      description: false,
      price: false,
      availability: false,
    });
  });

  it("matching is case-insensitive", () => {
    const result = getFieldVisibility(rules, "Option_A");
    expect(result).toEqual({
      title: true,
      description: true,
      price: false,
      availability: false,
    });
  });

  it("handles overlapping fields across rules", () => {
    const overlapping: Rule[] = [
      { value: "a", fields: ["shared", "only_a"] },
      { value: "b", fields: ["shared", "only_b"] },
    ];
    const result = getFieldVisibility(overlapping, "a");
    expect(result).toEqual({
      shared: true,
      only_a: true,
      only_b: false,
    });
  });

  it("returns empty object for no rules", () => {
    expect(getFieldVisibility([], "anything")).toEqual({});
  });
});

describe("migrateLegacyParameters", () => {
  it("converts legacy format to rules", () => {
    const legacy = {
      option_a: ["title", "body"],
      option_b: ["image"],
    };
    const rules = migrateLegacyParameters(legacy);
    expect(rules).toEqual([
      { value: "option_a", fields: ["title", "body"] },
      { value: "option_b", fields: ["image"] },
    ]);
  });

  it("returns empty array for empty object", () => {
    expect(migrateLegacyParameters({})).toEqual([]);
  });

  it("filters out non-string field values", () => {
    const legacy = {
      option: [42, "valid", null],
    };
    const rules = migrateLegacyParameters(legacy);
    expect(rules).toEqual([{ value: "option", fields: ["valid"] }]);
  });

  it("skips non-array values", () => {
    const legacy = {
      good: ["field1"],
      bad: "not_an_array",
    };
    const rules = migrateLegacyParameters(legacy);
    expect(rules).toEqual([{ value: "good", fields: ["field1"] }]);
  });
});
