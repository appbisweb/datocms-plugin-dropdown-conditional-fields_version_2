export type Rule = {
  value: string;
  fields: string[];
  requiredFields?: string[];
};

export type FieldExtensionParameters = {
  rules: Rule[];
};

export type GlobalParameters = {
  debugMode: boolean;
  migratedFromLegacyPlugin?: boolean;
};

export type LegacyParameters = Record<string, string[]>;
