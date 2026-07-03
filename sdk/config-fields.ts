import { z } from "zod";
import type {
  BooleanFieldMeta,
  ConfigActionMeta,
  ConfigElement,
  ConfigFieldMeta,
  ConfigGroupMeta,
  JsonObject,
  SecretFieldMeta,
  SelectFieldMeta,
  TextFieldMeta,
  UrlFieldMeta,
} from "./types";

type FieldInput<T extends ConfigFieldMeta> = Omit<T, "type">;

/**
 * Config-field builders. The meta is fully serializable: it drives the
 * generated config form, secret encryption, and manifest serialization.
 */
export const cf = {
  text(input: FieldInput<TextFieldMeta>): TextFieldMeta {
    return { ...input, type: "text" };
  },
  secret(input: FieldInput<SecretFieldMeta>): SecretFieldMeta {
    return { ...input, type: "secret" };
  },
  url(input: FieldInput<UrlFieldMeta>): UrlFieldMeta {
    return { ...input, type: "url" };
  },
  select(input: FieldInput<SelectFieldMeta>): SelectFieldMeta {
    return { ...input, type: "select" };
  },
  boolean(input: FieldInput<BooleanFieldMeta>): BooleanFieldMeta {
    return { ...input, type: "boolean" };
  },
  group(input: Omit<ConfigGroupMeta, "type">): ConfigGroupMeta {
    return { ...input, type: "group" };
  },
  action(input: Omit<ConfigActionMeta, "type">): ConfigActionMeta {
    return { ...input, type: "action" };
  },
};

/** Flatten groups into a single field list (actions excluded). */
export function flattenFields(elements: ConfigElement[]): ConfigFieldMeta[] {
  const fields: ConfigFieldMeta[] = [];
  for (const el of elements) {
    if (el.type === "group") fields.push(...el.fields);
    else if (el.type !== "action") fields.push(el);
  }
  return fields;
}

/** Keys of fields that must be stored encrypted. */
export function listSecretKeys(elements: ConfigElement[]): string[] {
  return flattenFields(elements)
    .filter((f) => f.type === "secret")
    .map((f) => f.key);
}

function fieldSchema(field: ConfigFieldMeta): z.ZodTypeAny {
  let schema: z.ZodTypeAny;
  switch (field.type) {
    case "boolean":
      schema = z.boolean();
      break;
    case "url":
      schema = z.string().url();
      break;
    case "select":
      schema = z.enum(
        field.options.map((o) => o.value) as [string, ...string[]]
      );
      break;
    default:
      schema = z.string().min(field.required ? 1 : 0);
  }
  if (!field.required) schema = schema.optional().nullable();
  return schema;
}

/**
 * Build the zod validation schema for an installation config from field meta.
 * `visibleIf` is a display concern only — hidden fields simply stay optional.
 */
export function buildConfigSchema(elements: ConfigElement[]): z.ZodObject<z.ZodRawShape> {
  const shape: z.ZodRawShape = {};
  for (const field of flattenFields(elements)) {
    shape[field.key] = fieldSchema(field);
  }
  // passthrough: connectors may persist extra state via ctx.config.update
  return z.object(shape).passthrough();
}

/** Validate a config object; returns a typed error message list on failure. */
export function validateConfig(
  elements: ConfigElement[],
  config: JsonObject
): { success: true; data: JsonObject } | { success: false; errors: string[] } {
  const result = buildConfigSchema(elements).safeParse(config);
  if (result.success) return { success: true, data: result.data as JsonObject };
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}
