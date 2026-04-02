import {
  connect,
  type FieldAppearanceChange,
  type OnBootCtx,
} from "datocms-plugin-sdk";
import "datocms-react-ui/styles.css";
import { render } from "./lib/render";
import ConfigScreen from "./entrypoints/ConfigScreen";
import FieldExtension from "./entrypoints/FieldExtension";
import FieldExtensionConfig from "./entrypoints/FieldExtensionConfig";
import { normalizeValue } from "./lib/toggleFields";
import type { GlobalParameters, Rule } from "./lib/types";

const EXTENSION_ID = "conditionalFields";

let lastUpsertAlertMs = 0;

function isFieldValueEmpty(value: unknown, depth = 0): boolean {
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

connect({
  manualFieldExtensions() {
    return [
      {
        id: EXTENSION_ID,
        name: "Dropdown Conditional Fields",
        type: "addon" as const,
        fieldTypes: ["string" as const],
        configurable: true,
      },
    ];
  },

  renderConfigScreen(ctx) {
    render(<ConfigScreen ctx={ctx} />);
  },

  renderFieldExtension(_id, ctx) {
    render(<FieldExtension ctx={ctx} />);
  },

  renderManualFieldExtensionConfigScreen(_id, ctx) {
    render(<FieldExtensionConfig ctx={ctx} />);
  },

  validateManualFieldExtensionParameters(
    _id,
    parameters: Record<string, unknown>,
  ) {
    const errors: Record<string, string> = {};
    const rules = parameters.rules;

    if (!Array.isArray(rules) || rules.length === 0) {
      errors.rules = "At least one rule is required.";
      return errors;
    }

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i] as {
        value?: string;
        fields?: string[];
        requiredFields?: string[];
      };
      if (!rule.value || rule.value.trim() === "") {
        errors[`rule_${i}_value`] =
          `Rule ${i + 1}: Dropdown value must not be empty.`;
      }
      if (!Array.isArray(rule.fields) || rule.fields.length === 0) {
        errors[`rule_${i}_fields`] =
          `Rule ${i + 1}: At least one field must be selected.`;
      }
      if (
        rule.requiredFields?.some(
          (f) => !rule.fields?.includes(f),
        )
      ) {
        errors[`rule_${i}_required`] =
          `Rule ${i + 1}: Required fields must be a subset of visible fields.`;
      }
    }

    return errors;
  },

  onBeforeItemUpsert(payload, ctx) {
    const debug = !!(
      ctx.plugin.attributes.parameters as Partial<GlobalParameters>
    )?.debugMode;

    const data = payload.data as Record<string, unknown>;
    const itemTypeId = (
      (data.relationships as Record<string, unknown> | undefined)
        ?.item_type as { data: { id: string } } | undefined
    )?.data?.id;

    if (!itemTypeId) return true;

    type AddonField = {
      triggerApiKey: string;
      fieldTypeId: string;
      rules: Rule[];
      selectOptions: Array<{ label?: string; value?: string }>;
    };
    const addonFields: AddonField[] = [];

    for (const field of Object.values(ctx.fields)) {
      if (!field) continue;
      for (const addon of field.attributes.appearance.addons || []) {
        const params = addon.parameters as Record<string, unknown>;
        const rules = params?.rules;
        if (!Array.isArray(rules)) continue;
        const rulesWithReq = (rules as Rule[]).filter(
          (r) => r.requiredFields?.length,
        );
        if (rulesWithReq.length === 0) continue;

        const ap = field.attributes.appearance.parameters as
          | Record<string, unknown>
          | undefined;

        addonFields.push({
          triggerApiKey: field.attributes.api_key,
          fieldTypeId: field.relationships.item_type.data.id,
          rules: rulesWithReq,
          selectOptions: (
            Array.isArray(ap?.options) ? ap!.options : []
          ) as Array<{ label?: string; value?: string }>,
        });
      }
    }

    if (addonFields.length === 0) return true;

    const relevantBlockTypeIds = new Set(
      addonFields
        .filter((a) => a.fieldTypeId !== itemTypeId)
        .map((a) => a.fieldTypeId),
    );

    const token = ctx.currentUserAccessToken;
    const payloadAttrs = (data.attributes ?? {}) as Record<
      string,
      unknown
    >;
    const itemId = data.id as string | undefined;
    let fullAttrs: Record<string, unknown> = { ...payloadAttrs };

    if (itemId) {
      try {
        const xhr = new XMLHttpRequest();
        xhr.open(
          "GET",
          `https://site-api.datocms.com/items/${itemId}`,
          false,
        );
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("Accept", "application/json");
        xhr.setRequestHeader("X-Api-Version", "3");
        xhr.send(null);
        if (xhr.status === 200) {
          const json = JSON.parse(xhr.responseText) as Record<
            string,
            unknown
          >;
          const currentAttrs =
            (json.data as { attributes?: Record<string, unknown> })
              ?.attributes ?? {};
          fullAttrs = { ...currentAttrs, ...payloadAttrs };
        }
      } catch {
        /* fallback */
      }
    }

    type BlockData = { typeId: string; attrs: Record<string, unknown> };
    const blockMap = new Map<string, BlockData>();

    if (relevantBlockTypeIds.size > 0) {
      type BlockRef = {
        id: string;
        typeId?: string;
        payloadAttrs?: Record<string, unknown>;
      };
      const blockRefs: BlockRef[] = [];

      function scanForBlockRefs(val: unknown, depth: number): void {
        if (depth > 4 || !val) return;
        if (Array.isArray(val)) {
          for (const item of val) {
            if (typeof item === "string" && item.length > 5) {
              blockRefs.push({ id: item });
            } else if (item && typeof item === "object") {
              const obj = item as Record<string, unknown>;
              const blockId = obj.id as string | undefined;
              const rels = obj.relationships as
                | Record<string, unknown>
                | undefined;
              const typeId = (
                rels?.item_type as { data?: { id?: string } }
              )?.data?.id;
              if (blockId && typeId) {
                blockRefs.push({
                  id: blockId,
                  typeId,
                  payloadAttrs: (obj.attributes ?? undefined) as
                    | Record<string, unknown>
                    | undefined,
                });
              }
            }
          }
        } else if (typeof val === "object") {
          for (const v of Object.values(
            val as Record<string, unknown>,
          )) {
            scanForBlockRefs(v, depth + 1);
          }
        }
      }

      scanForBlockRefs(fullAttrs, 0);

      if (debug)
        console.warn(
          "[CF] blockRefs found:",
          blockRefs.length,
          blockRefs.map((r) => `${r.id}(${r.typeId ?? "?"})`),
        );

      for (const ref of blockRefs) {
        if (
          ref.typeId &&
          !relevantBlockTypeIds.has(ref.typeId)
        )
          continue;

        try {
          const xhr2 = new XMLHttpRequest();
          xhr2.open(
            "GET",
            `https://site-api.datocms.com/items/${ref.id}`,
            false,
          );
          xhr2.setRequestHeader(
            "Authorization",
            `Bearer ${token}`,
          );
          xhr2.setRequestHeader("Accept", "application/json");
          xhr2.setRequestHeader("X-Api-Version", "3");
          xhr2.send(null);
          if (xhr2.status === 200) {
            const bJson = JSON.parse(xhr2.responseText) as Record<
              string,
              unknown
            >;
            const bData = bJson.data as Record<string, unknown>;
            const bAttrs = (bData?.attributes ?? {}) as Record<
              string,
              unknown
            >;
            const bTypeId = (
              (bData?.relationships as Record<string, unknown>)
                ?.item_type as { data?: { id?: string } }
            )?.data?.id;

            if (bTypeId && relevantBlockTypeIds.has(bTypeId)) {
              const merged = ref.payloadAttrs
                ? { ...bAttrs, ...ref.payloadAttrs }
                : bAttrs;
              blockMap.set(ref.id, {
                typeId: bTypeId,
                attrs: merged,
              });
            }
          }
        } catch {
          /* skip */
        }
      }
    }

    if (debug)
      console.warn(
        "[CF] addonFields:",
        addonFields.length,
        "blockMap:",
        blockMap.size,
      );

    for (const af of addonFields) {
      const contexts: Record<string, unknown>[] = [];

      if (af.fieldTypeId === itemTypeId) {
        contexts.push(fullAttrs);
      } else {
        for (const block of blockMap.values()) {
          if (block.typeId === af.fieldTypeId) {
            contexts.push(block.attrs);
          }
        }
      }

      if (debug)
        console.warn(
          "[CF] field:",
          af.triggerApiKey,
          "isBlock:",
          af.fieldTypeId !== itemTypeId,
          "contexts:",
          contexts.length,
        );

      for (const contextAttrs of contexts) {
        const rawTriggerVal = contextAttrs[af.triggerApiKey];
        const triggerValue =
          typeof rawTriggerVal === "object" && rawTriggerVal !== null
            ? normalizeValue(
                Object.values(
                  rawTriggerVal as Record<string, unknown>,
                )[0],
              )
            : normalizeValue(rawTriggerVal);

        if (triggerValue === null) continue;

        for (const rule of af.rules) {
          if (normalizeValue(rule.value) !== triggerValue) continue;

          const dropdownLabel =
            af.selectOptions.find(
              (o) =>
                typeof o.value === "string" &&
                o.value.toLowerCase() === rule.value.toLowerCase(),
            )?.label ?? rule.value;

          for (const reqApiKey of rule.requiredFields!) {
            if (!rule.fields.includes(reqApiKey)) continue;

            const fieldValue = contextAttrs[reqApiKey];
            if (!isFieldValueEmpty(fieldValue)) continue;

            const reqField = Object.values(ctx.fields).find(
              (f) => f?.attributes.api_key === reqApiKey,
            );
            const label = reqField?.attributes.label ?? reqApiKey;

            const now = Date.now();
            if (now - lastUpsertAlertMs > 2000) {
              lastUpsertAlertMs = now;
              ctx.alert(
                `The field "${label}" is required when "${dropdownLabel}" is selected but is currently empty. Please fill it in.`,
              );
            }
            return false;
          }
        }
      }
    }

    return true;
  },

  async onBoot(ctx: OnBootCtx) {
    const params = ctx.plugin.attributes
      .parameters as Partial<GlobalParameters>;
    if (params.migratedFromLegacyPlugin) return;

    if (!ctx.currentRole.meta.final_permissions.can_edit_schema) return;

    const fields = await ctx.loadFieldsUsingPlugin();
    if (fields.length === 0) return;

    await Promise.all(
      fields.map(async (field) => {
        const { appearance } = field.attributes;
        const changes: FieldAppearanceChange[] = [];

        const editor = appearance.editor as unknown;
        if (
          editor &&
          typeof editor === "object" &&
          !("fieldExtensionId" in editor)
        ) {
          changes.push({
            operation: "updateEditor",
            newFieldExtensionId: EXTENSION_ID,
          });
        }

        appearance.addons.forEach(
          (addon: Record<string, unknown>, index: number) => {
            if (!addon.field_extension) {
              changes.push({
                operation: "updateAddon",
                index,
                newFieldExtensionId: EXTENSION_ID,
              });
            }
          },
        );

        if (changes.length > 0) {
          await ctx.updateFieldAppearance(field.id, changes);
        }
      }),
    );

    await ctx.updatePluginParameters({
      ...params,
      migratedFromLegacyPlugin: true,
    });
  },
});
