import { z } from "zod";
import { flattenFields, listSecretKeys } from "./config-fields";
import type {
  ConnectorCronDecl,
  ConnectorDefinition,
  SerializedManifest,
} from "./types";

/** Version of the SDK contract implemented by this host / build. */
export const SDK_VERSION = "1.0.0";

const CRON_EVERY_REGEX = /^\d+(m|h|d)$/;
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
const ID_REGEX = /^[a-z][a-z0-9-]{1,48}$/;
const DOMAIN_REGEX = /^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const ROUTE_KEY_REGEX = /^(GET|POST|PUT|PATCH|DELETE) \/[a-zA-Z0-9/_-]*$/;

const configFieldBase = {
  key: z.string().min(1),
  label: z.string().min(1),
  help: z.string().optional(),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  defaultValue: z.unknown().optional(),
  visibleIf: z.object({ key: z.string(), equals: z.unknown() }).optional(),
};

const configFieldSchema = z.discriminatedUnion("type", [
  z.object({ ...configFieldBase, type: z.literal("text") }),
  z.object({ ...configFieldBase, type: z.literal("secret") }),
  z.object({ ...configFieldBase, type: z.literal("url") }),
  z.object({
    ...configFieldBase,
    type: z.literal("select"),
    options: z.array(z.object({ value: z.string(), label: z.string() })).min(1),
  }),
  z.object({ ...configFieldBase, type: z.literal("boolean") }),
]);

const configElementSchema = z.union([
  configFieldSchema,
  z.object({
    type: z.literal("group"),
    key: z.string().min(1),
    label: z.string().min(1),
    help: z.string().optional(),
    fields: z.array(configFieldSchema),
  }),
  z.object({
    type: z.literal("action"),
    key: z.string().min(1),
    label: z.string().min(1),
    help: z.string().optional(),
    variant: z.enum(["default", "destructive"]).optional(),
  }),
]);

const manifestSchema = z.object({
  id: z.string().regex(ID_REGEX, "id must be kebab-case"),
  name: z.string().min(1),
  version: z.string().regex(SEMVER_REGEX, "version must be semver x.y.z"),
  category: z.enum(["erp", "shop"]),
  minSdkVersion: z.string().regex(SEMVER_REGEX),
  description: z.string().optional(),
  allowedDomains: z.array(z.string().regex(DOMAIN_REGEX, "invalid domain pattern")),
  allowedDomainsFromConfig: z.array(z.string()).optional(),
  oauth: z
    .object({
      authorizationUrl: z.string().min(1),
      tokenUrl: z.string().min(1),
      scopes: z.array(z.string()),
      pkce: z.boolean().optional(),
      clientIdConfigKey: z.string().optional(),
      clientSecretConfigKey: z.string().optional(),
      extraAuthParams: z.record(z.string()).optional(),
    })
    .optional(),
  events: z
    .array(
      z.object({
        suffix: z.string().regex(/^[a-z][a-z0-9_.]*$/),
        name: z.string(),
        description: z.string(),
      })
    )
    .optional(),
  configFields: z.array(configElementSchema),
});

export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/**
 * Validate and freeze a connector definition. Every connector module must
 * `export default defineConnector({...})`.
 */
export function defineConnector(def: ConnectorDefinition): ConnectorDefinition {
  const parsed = manifestSchema.safeParse(def.manifest);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid connector manifest: ${issues}`);
  }

  const fields = flattenFields(def.manifest.configFields);
  const keys = fields.map((f) => f.key);
  const dup = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dup) throw new Error(`Invalid connector manifest: duplicate config key "${dup}"`);

  const fromConfig = def.manifest.allowedDomainsFromConfig ?? [];
  for (const key of fromConfig) {
    if (!keys.includes(key)) {
      throw new Error(
        `Invalid connector manifest: allowedDomainsFromConfig references unknown config key "${key}"`
      );
    }
  }

  const oauth = def.manifest.oauth;
  if (oauth?.clientSecretConfigKey) {
    const field = fields.find((f) => f.key === oauth.clientSecretConfigKey);
    if (!field || field.type !== "secret") {
      throw new Error(
        `Invalid connector manifest: oauth.clientSecretConfigKey must reference a secret field`
      );
    }
  }

  if (typeof def.checkConnection !== "function") {
    throw new Error(`Connector "${def.manifest.id}": checkConnection is required`);
  }

  if (def.manifest.category === "erp" && !def.capabilities?.invoice?.create) {
    throw new Error(
      `Connector "${def.manifest.id}": category "erp" requires capabilities.invoice.create`
    );
  }

  for (const routeKey of Object.keys(def.routes ?? {})) {
    if (!ROUTE_KEY_REGEX.test(routeKey)) {
      throw new Error(
        `Connector "${def.manifest.id}": invalid route key "${routeKey}" (expected "METHOD /path")`
      );
    }
  }

  const actionKeys = def.manifest.configFields
    .filter((el) => el.type === "action")
    .map((el) => el.key);
  for (const key of actionKeys) {
    if (!def.actions?.[key]) {
      throw new Error(
        `Connector "${def.manifest.id}": config action "${key}" has no handler in actions`
      );
    }
  }

  for (const [name, job] of Object.entries(def.cron ?? {})) {
    if (!CRON_EVERY_REGEX.test(job.every)) {
      throw new Error(
        `Connector "${def.manifest.id}": cron "${name}" has invalid interval "${job.every}" (expected e.g. "5m", "1h", "1d")`
      );
    }
  }

  return Object.freeze(def);
}

/**
 * Manifest as persisted in the zip and the `connector_versions` row: the
 * declarative manifest + cron schedules + the SDK version it targets.
 */
export function serializeManifest(def: ConnectorDefinition): SerializedManifest {
  const cron: Record<string, ConnectorCronDecl> = {};
  for (const [name, job] of Object.entries(def.cron ?? {})) {
    cron[name] = { every: job.every, timeoutMs: job.timeoutMs };
  }
  return {
    ...def.manifest,
    ...(Object.keys(cron).length > 0 ? { cron } : {}),
    sdkVersion: SDK_VERSION,
  };
}

/** Parse `"15m" | "2h" | "1d"` into milliseconds. */
export function parseCronInterval(every: string): number {
  const match = every.match(/^(\d+)(m|h|d)$/);
  if (!match) throw new Error(`Invalid cron interval: ${every}`);
  const value = Number(match[1]);
  const unit = match[2] === "m" ? 60_000 : match[2] === "h" ? 3_600_000 : 86_400_000;
  return value * unit;
}

/** Export secret keys helper for host-side encryption. */
export { listSecretKeys };
