import { useEffect, useRef } from 'react';
import type { RenderFieldExtensionCtx } from 'datocms-plugin-sdk';
import { Canvas } from 'datocms-react-ui';
import {
  normalizeValue,
  getFieldVisibility,
  migrateLegacyParameters,
  isFieldValueEmpty,
} from '../lib/toggleFields';
import type { GlobalParameters, Rule } from '../lib/types';

type Props = {
  ctx: RenderFieldExtensionCtx;
};

function resolveRules(parameters: Record<string, unknown>): Rule[] {
  if (Array.isArray(parameters.rules)) {
    return parameters.rules as Rule[];
  }
  return migrateLegacyParameters(parameters);
}

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export default function FieldExtension({ ctx }: Props) {
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const rules = resolveRules(ctx.parameters);
  const globalParams = ctx.plugin.attributes
    .parameters as Partial<GlobalParameters>;
  const debugMode = globalParams.debugMode ?? false;

  const fieldPath = ctx.fieldPath;
  const rawValue = getByPath(ctx.formValues, fieldPath);
  const currentValue = normalizeValue(rawValue);

  const prevValueRef = useRef<string | null | undefined>(undefined);
  const rulesJson = JSON.stringify(rules);

  useEffect(() => {
    if (
      prevValueRef.current === currentValue &&
      prevValueRef.current !== undefined
    ) {
      return;
    }
    prevValueRef.current = currentValue;

    const c = ctxRef.current;
    const visibility = getFieldVisibility(rules, currentValue);
    const locales = c.site.attributes.locales;

    const parentPath = c.parentField ? fieldPath.replace(/\.[^.]+$/, '') : null;

    if (debugMode) {
      console.log('[ConditionalFields] fieldPath:', fieldPath);
      console.log('[ConditionalFields] rawValue:', rawValue);
      console.log('[ConditionalFields] normalised:', currentValue);
      console.log('[ConditionalFields] parentPath:', parentPath);
      console.log('[ConditionalFields] locales:', locales);
      console.log(
        '[ConditionalFields] visibility:',
        JSON.stringify(visibility),
      );
    }

    for (const [apiKey, show] of Object.entries(visibility)) {
      const basePath = parentPath ? `${parentPath}.${apiKey}` : apiKey;

      const dependentField = Object.values(c.fields).find(
        (f) => f?.attributes.api_key === apiKey,
      );

      const isLocalized = dependentField?.attributes.localized ?? false;

      if (isLocalized) {
        for (const locale of locales) {
          const path = `${basePath}.${locale}`;
          if (debugMode) {
            console.log(
              `[ConditionalFields] toggleField("${path}", ${show}) [localized]`,
            );
          }
          c.toggleField(path, show).catch((err: unknown) => {
            console.error(
              `[ConditionalFields] toggleField("${path}", ${show}) failed:`,
              err,
            );
          });
        }
      } else {
        if (debugMode) {
          console.log(
            `[ConditionalFields] toggleField("${basePath}", ${show})`,
          );
        }
        c.toggleField(basePath, show).catch((err: unknown) => {
          console.error(
            `[ConditionalFields] toggleField("${basePath}", ${show}) failed:`,
            err,
          );
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentValue, rulesJson, debugMode, fieldPath]);

  const parentPath = ctx.parentField ? fieldPath.replace(/\.[^.]+$/, '') : null;

  const activeRule = currentValue
    ? rules.find(
        (r) =>
          normalizeValue(r.value) === currentValue && r.requiredFields?.length,
      )
    : null;

  const emptyRequiredLabels: string[] = [];
  if (activeRule?.requiredFields) {
    const triggerFieldTypeId = Object.values(ctx.fields).find(
      (f) => f?.attributes.api_key === ctx.field.attributes.api_key,
    )?.relationships.item_type.data.id;

    for (const reqApiKey of activeRule.requiredFields) {
      if (!activeRule.fields.includes(reqApiKey)) continue;

      const valuePath = parentPath ? `${parentPath}.${reqApiKey}` : reqApiKey;
      const fieldValue = getByPath(ctx.formValues, valuePath);

      if (isFieldValueEmpty(fieldValue)) {
        const reqField = Object.values(ctx.fields).find(
          (f) =>
            f?.attributes.api_key === reqApiKey &&
            (!triggerFieldTypeId ||
              f.relationships.item_type.data.id === triggerFieldTypeId),
        );
        emptyRequiredLabels.push(reqField?.attributes.label ?? reqApiKey);
      }
    }
  }

  return (
    <Canvas ctx={ctx}>
      {emptyRequiredLabels.length > 0 && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #ef4444',
            borderRadius: 4,
            padding: '8px 12px',
            fontSize: 13,
            color: '#b91c1c',
            lineHeight: 1.4,
          }}
        >
          <strong>↓ Required fields empty ↓:</strong>{' '}
          {emptyRequiredLabels.join(', ')}
        </div>
      )}
    </Canvas>
  );
}
