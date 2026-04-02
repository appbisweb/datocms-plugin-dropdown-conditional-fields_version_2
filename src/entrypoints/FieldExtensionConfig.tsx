import { useCallback, useMemo, useState } from "react";
import type { RenderManualFieldExtensionConfigScreenCtx } from "datocms-plugin-sdk";
import {
  Canvas,
  Button,
  TextField,
  SelectField,
  Form,
  FieldGroup,
  Section,
} from "datocms-react-ui";
import type { Rule } from "../lib/types";

type Props = {
  ctx: RenderManualFieldExtensionConfigScreenCtx;
};

type Option = { label: string; value: string };

type FieldMeta = {
  apiKey: string;
  label: string;
  isRequired: boolean;
};

function useModelFields(ctx: RenderManualFieldExtensionConfigScreenCtx) {
  const currentApiKey = ctx.pendingField.attributes.api_key;
  const modelFieldLinks = ctx.itemType.relationships.fields.data as Array<{
    id: string;
  }>;

  const options: Option[] = [];
  const meta: FieldMeta[] = [];

  for (const link of modelFieldLinks) {
    const field = ctx.fields[link.id];
    if (!field) continue;
    if (field.attributes.api_key === currentApiKey) continue;

    const validators = field.attributes.validators as Record<
      string,
      unknown
    >;
    const isRequired = "required" in validators;

    options.push({
      label: field.attributes.label,
      value: field.attributes.api_key,
    });
    meta.push({
      apiKey: field.attributes.api_key,
      label: field.attributes.label,
      isRequired,
    });
  }

  return { options, meta };
}

function extractDropdownOptions(
  ctx: RenderManualFieldExtensionConfigScreenCtx,
): Option[] {
  const attrs = ctx.pendingField.attributes;

  const validators = attrs.validators as
    | Record<string, unknown>
    | undefined;
  const enumValidator = validators?.enum as
    | { values: string[] }
    | undefined;

  if (enumValidator?.values?.length) {
    return enumValidator.values.map((v) => ({ label: v, value: v }));
  }

  const appearance = attrs.appearance as
    | { parameters?: Record<string, unknown> }
    | undefined;
  const params = appearance?.parameters as
    | Record<string, unknown>
    | undefined;

  if (params?.options && Array.isArray(params.options)) {
    const mapped = (params.options as Array<Record<string, unknown>>)
      .map((item) => {
        if (typeof item.value === "string") {
          return {
            label: (typeof item.label === "string"
              ? item.label
              : item.value) as string,
            value: item.value,
          };
        }
        return null;
      })
      .filter(Boolean) as Option[];
    if (mapped.length) return mapped;
  }

  return [];
}

function parseInitialRules(parameters: Record<string, unknown>): Rule[] {
  if (Array.isArray(parameters.rules) && parameters.rules.length > 0) {
    return parameters.rules as Rule[];
  }
  return [{ value: "", fields: [] }];
}

function getRequiredFieldsNotInAllRules(
  rules: Rule[],
  fieldMeta: FieldMeta[],
): FieldMeta[] {
  const allManagedKeys = new Set(rules.flatMap((r) => r.fields));
  const rulesWithValues = rules.filter((r) => r.value.trim() !== "");

  return fieldMeta.filter((f) => {
    if (!f.isRequired) return false;
    if (!allManagedKeys.has(f.apiKey)) return false;
    const inEveryRule = rulesWithValues.every((r) =>
      r.fields.includes(f.apiKey),
    );
    return !inEveryRule;
  });
}

function StaleValueBanner({
  rule,
  dropdownOptions,
}: {
  rule: Rule;
  dropdownOptions: Option[];
}) {
  if (!rule.value.trim()) return null;
  const match = dropdownOptions.find(
    (o) => o.value.toLowerCase() === rule.value.toLowerCase(),
  );
  if (match) return null;

  return (
    <p
      style={{
        color: "var(--alert-color)",
        fontSize: "var(--font-size-xs)",
        margin: "0 0 8px",
        padding: "6px 8px",
        background: "var(--alert-color-a10, #fff3f0)",
        borderRadius: 4,
      }}
    >
      ⚠ The saved value "{rule.value}" no longer matches any dropdown
      option. Please select a valid option.
    </p>
  );
}

export default function FieldExtensionConfig({ ctx }: Props) {
  const { options: fieldOptions, meta: fieldMeta } = useModelFields(ctx);
  const dropdownOptions = extractDropdownOptions(ctx);
  const hasDropdownOptions = dropdownOptions.length > 0;

  const validValues = useMemo(
    () => new Set(dropdownOptions.map((o) => o.value.toLowerCase())),
    [dropdownOptions],
  );

  const [rules, setRules] = useState<Rule[]>(() =>
    parseInitialRules(ctx.parameters),
  );
  const [blurWarnings, setBlurWarnings] = useState<Record<string, string>>(
    {},
  );
  const errors = ctx.errors as Record<string, string>;

  const requiredFieldsAtRisk = useMemo(
    () => getRequiredFieldsNotInAllRules(rules, fieldMeta),
    [rules, fieldMeta],
  );

  const propagate = useCallback(
    (updated: Rule[]) => {
      setRules(updated);
      ctx.setParameters({ rules: updated });
    },
    [ctx],
  );

  const updateRule = useCallback(
    (index: number, patch: Partial<Rule>) => {
      const updated = rules.map((r, i) => {
        if (i !== index) return r;
        const merged = { ...r, ...patch };

        if ("fields" in patch && merged.requiredFields) {
          merged.requiredFields = merged.requiredFields.filter((f) =>
            merged.fields.includes(f),
          );
        }

        return merged;
      });
      propagate(updated);

      if ("value" in patch) {
        setBlurWarnings((prev) => {
          const next = { ...prev };
          delete next[`rule_${index}_value`];
          return next;
        });
      }
    },
    [rules, propagate],
  );

  const addRule = useCallback(() => {
    propagate([...rules, { value: "", fields: [] }]);
  }, [rules, propagate]);

  const removeRule = useCallback(
    (index: number) => {
      const updated = rules.filter((_, i) => i !== index);
      propagate(updated.length > 0 ? updated : [{ value: "", fields: [] }]);
    },
    [rules, propagate],
  );

  const validateDropdownValue = useCallback(
    (index: number, value: string) => {
      if (!value.trim()) {
        setBlurWarnings((prev) => {
          const next = { ...prev };
          delete next[`rule_${index}_value`];
          return next;
        });
        return;
      }

      if (hasDropdownOptions && !validValues.has(value.toLowerCase())) {
        const known = dropdownOptions
          .map((o) => `"${o.value}"`)
          .join(", ");
        setBlurWarnings((prev) => ({
          ...prev,
          [`rule_${index}_value`]: `"${value}" does not match any known dropdown option (${known}). Check for typos.`,
        }));
      } else {
        setBlurWarnings((prev) => {
          const next = { ...prev };
          delete next[`rule_${index}_value`];
          return next;
        });
      }
    },
    [hasDropdownOptions, validValues, dropdownOptions],
  );

  return (
    <Canvas ctx={ctx}>
      <Form>
        <FieldGroup>
          <Section
            title="Conditional field rules"
            headerStyle={{ marginBottom: 16 }}
          >
            <p
              style={{
                fontSize: "var(--font-size-s)",
                color: "var(--light-body-color)",
                margin: "0 0 16px",
              }}
            >
              For each dropdown value, choose which fields should be
              visible. All other managed fields are automatically hidden.
            </p>
          </Section>

          {requiredFieldsAtRisk.length > 0 && (
            <div
              style={{
                background: "var(--warning-color-a10, #fff8e6)",
                border: "1px solid var(--warning-color, #e6a817)",
                borderRadius: 4,
                padding: "10px 12px",
                marginBottom: 16,
                fontSize: "var(--font-size-s)",
              }}
            >
              <strong>Required fields warning:</strong> The following
              fields are marked as <em>required</em> in the model schema
              but are not included in every rule:{" "}
              <strong>
                {requiredFieldsAtRisk.map((f) => f.label).join(", ")}
              </strong>
              .
              <br />
              When these fields are hidden, the record cannot be saved or
              published because DatoCMS still validates them server-side.
              Either include them in all rules, or remove the{" "}
              <em>required</em> validator from these fields.
            </div>
          )}

          {errors.rules && (
            <p
              style={{
                color: "var(--alert-color)",
                fontSize: "var(--font-size-s)",
              }}
            >
              {errors.rules}
            </p>
          )}

          {rules.map((rule, index) => (
            <div
              key={index}
              style={{
                border: "1px solid var(--border-color)",
                borderRadius: 4,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <strong style={{ fontSize: "var(--font-size-s)" }}>
                  Rule {index + 1}
                </strong>
                {rules.length > 1 && (
                  <Button
                    buttonType="negative"
                    buttonSize="xxs"
                    type="button"
                    onClick={() => removeRule(index)}
                  >
                    Remove
                  </Button>
                )}
              </div>

              <FieldGroup>
                {hasDropdownOptions ? (
                  <>
                    <StaleValueBanner
                      rule={rule}
                      dropdownOptions={dropdownOptions}
                    />
                    <SelectField<Option, false, never>
                      id={`rule-${index}-value`}
                      name={`rule-${index}-value`}
                      label="Dropdown value"
                      hint="The value for which the selected fields will be shown (case-insensitive)"
                      required
                      value={
                        dropdownOptions.find(
                          (o) =>
                            o.value.toLowerCase() ===
                            rule.value.toLowerCase(),
                        ) ?? null
                      }
                      onChange={(selected) => {
                        updateRule(index, {
                          value: selected ? selected.value : "",
                        });
                      }}
                      selectInputProps={{
                        isMulti: false,
                        options: dropdownOptions,
                        isClearable: true,
                        placeholder: "Select a dropdown value…",
                      }}
                      error={errors[`rule_${index}_value`]}
                    />
                  </>
                ) : (
                  <TextField
                    id={`rule-${index}-value`}
                    name={`rule-${index}-value`}
                    label="Dropdown value"
                    hint="Type the exact value that triggers this rule (case-insensitive)"
                    required
                    value={rule.value}
                    onChange={(newValue) => {
                      updateRule(index, { value: newValue });
                    }}
                    placeholder="e.g. group, default, link…"
                    error={
                      errors[`rule_${index}_value`] ||
                      blurWarnings[`rule_${index}_value`]
                    }
                    textInputProps={{
                      onBlur: () =>
                        validateDropdownValue(index, rule.value),
                    }}
                  />
                )}

                <SelectField<Option, true, never>
                  id={`rule-${index}-fields`}
                  name={`rule-${index}-fields`}
                  label="Fields to show"
                  hint="Fields that should be visible when this dropdown value is selected"
                  required
                  value={
                    rule.fields
                      .map((apiKey) =>
                        fieldOptions.find((o) => o.value === apiKey),
                      )
                      .filter(Boolean) as Option[]
                  }
                  onChange={(selected) => {
                    const fields = selected
                      ? (selected as Option[]).map((o) => o.value)
                      : [];
                    updateRule(index, { fields });
                  }}
                  selectInputProps={{
                    isMulti: true,
                    options: fieldOptions,
                  }}
                  error={errors[`rule_${index}_fields`]}
                />

                {rule.fields.length > 0 && (
                  <SelectField<Option, true, never>
                    id={`rule-${index}-required`}
                    name={`rule-${index}-required`}
                    label="Required when visible"
                    hint="These fields must be filled in when this value is selected. Saving will be blocked if they are empty."
                    value={
                      (rule.requiredFields ?? [])
                        .map((apiKey) =>
                          fieldOptions.find(
                            (o) => o.value === apiKey,
                          ),
                        )
                        .filter(Boolean) as Option[]
                    }
                    onChange={(selected) => {
                      const requiredFields = selected
                        ? (selected as Option[]).map(
                            (o) => o.value,
                          )
                        : [];
                      updateRule(index, { requiredFields });
                    }}
                    selectInputProps={{
                      isMulti: true,
                      options: fieldOptions.filter((o) =>
                        rule.fields.includes(o.value),
                      ),
                      placeholder:
                        "Optional: select fields that must be filled…",
                    }}
                    error={errors[`rule_${index}_required`]}
                  />
                )}
              </FieldGroup>
            </div>
          ))}

          <Button
            type="button"
            buttonSize="s"
            buttonType="primary"
            onClick={addRule}
            fullWidth
          >
            + Add new rule
          </Button>
        </FieldGroup>
      </Form>
    </Canvas>
  );
}
