/**
 * Chorus Pay Connector SDK — public contract types.
 *
 * RULES (see doc/connectors/CONNECTOR_SPEC.md):
 * - This package must NOT import anything from the app (only zod + Node types),
 *   so it stays extractable to a standalone repo.
 * - Every ctx method is async and every argument/return value must be
 *   structured-clone-serializable (Buffers allowed, no streams, no DB handles):
 *   the same contract must be proxyable across an isolate/RPC boundary later.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

// ---------------------------------------------------------------------------
// Config fields (serializable meta — drives generated forms, secret encryption
// and manifest serialization)
// ---------------------------------------------------------------------------

export interface ConfigFieldBase {
  key: string;
  label: string;
  help?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: JsonValue;
  /** Only show this field when another field has a given value. */
  visibleIf?: { key: string; equals: JsonValue };
}

export interface TextFieldMeta extends ConfigFieldBase {
  type: "text";
}
export interface SecretFieldMeta extends ConfigFieldBase {
  /** Stored encrypted (AES-256-GCM) and masked in the UI. */
  type: "secret";
}
export interface UrlFieldMeta extends ConfigFieldBase {
  type: "url";
}
export interface SelectFieldMeta extends ConfigFieldBase {
  type: "select";
  options: Array<{ value: string; label: string }>;
}
export interface BooleanFieldMeta extends ConfigFieldBase {
  type: "boolean";
}

export type ConfigFieldMeta =
  | TextFieldMeta
  | SecretFieldMeta
  | UrlFieldMeta
  | SelectFieldMeta
  | BooleanFieldMeta;

/** Visual grouping of fields in the generated config page. */
export interface ConfigGroupMeta {
  type: "group";
  key: string;
  label: string;
  help?: string;
  fields: ConfigFieldMeta[];
}

/**
 * Button on the config page. Clicking it invokes the connector's
 * `actions[key]` handler (e.g. "Import catalog", "Resync").
 */
export interface ConfigActionMeta {
  type: "action";
  key: string;
  label: string;
  help?: string;
  variant?: "default" | "destructive";
}

export type ConfigElement = ConfigFieldMeta | ConfigGroupMeta | ConfigActionMeta;

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export type ConnectorCategory = "erp" | "shop";

/**
 * Declarative OAuth flow handled by the core broker (no plumbing needed in
 * connector code). Tokens are stored encrypted in the installation kv and
 * exposed via `ctx.oauth`.
 */
export interface ConnectorOAuthConfig {
  /**
   * Authorization endpoint. May contain `{configKey}` placeholders resolved
   * from the installation config (e.g. `https://{shop}/admin/oauth/authorize`).
   */
  authorizationUrl: string;
  /** Token endpoint. Supports the same `{configKey}` placeholders. */
  tokenUrl: string;
  scopes: string[];
  /** Use PKCE (recommended when the provider supports it). */
  pkce?: boolean;
  /** Config key holding the OAuth client id. */
  clientIdConfigKey?: string;
  /** Config key holding the OAuth client secret (must be a `secret` field). */
  clientSecretConfigKey?: string;
  /** Extra query params appended to the authorization URL. */
  extraAuthParams?: Record<string, string>;
}

export interface ConnectorEventDecl {
  /** Emitted as `connector.<manifest.id>.<suffix>`. */
  suffix: string;
  name: string;
  description: string;
}

export interface ConnectorCronDecl {
  /** Interval: `"5m"`, `"1h"`, `"24h"`… Minimum granularity = dispatcher cron cadence. */
  every: string;
  /** Max run duration before the invocation is abandoned (default 30 000). */
  timeoutMs?: number;
}

export interface ConnectorManifest {
  /** Unique kebab-case identifier (catalog `connector_key`). */
  id: string;
  name: string;
  /** Semver of the connector itself. */
  version: string;
  category: ConnectorCategory;
  /** Minimum host SDK version required (semver). */
  minSdkVersion: string;
  description?: string;
  /**
   * Hostnames `ctx.http` may reach. Exact (`api.pennylane.com`) or wildcard
   * (`*.myshopify.com`). HTTPS only; private/loopback IPs are always refused.
   */
  allowedDomains: string[];
  /**
   * Config keys whose (validated) URL host is added to the allowlist at ctx
   * creation — for user-provided base URLs (e.g. Dolibarr).
   */
  allowedDomainsFromConfig?: string[];
  oauth?: ConnectorOAuthConfig;
  /** Custom events this connector may emit (namespaced by the core). */
  events?: ConnectorEventDecl[];
  /** Config page definition (fields, groups, action buttons). */
  configFields: ConfigElement[];
}

/**
 * Manifest as serialized into the zip / DB: adds cron schedules (handlers are
 * code, schedules are data) and the SDK version it was built with.
 */
export interface SerializedManifest extends ConnectorManifest {
  cron?: Record<string, ConnectorCronDecl>;
  sdkVersion: string;
}

// ---------------------------------------------------------------------------
// ctx — the only surface a connector can touch
// ---------------------------------------------------------------------------

export interface ConnectorInstallationInfo {
  id: string;
  connectorId: string;
  supplierId: number;
  /** User-chosen label for this installation ("Boutique Paris"…). */
  name: string;
  testMode?: boolean;
}

export interface ConnectorHttpRequest {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  /** JSON-serializable body, pre-encoded string, or raw bytes. */
  body?: JsonValue | string | Uint8Array;
  responseType?: "json" | "text" | "buffer";
  /** Don't trigger critical-error alerting on failure. */
  silentOnError?: boolean;
  /** Free-form context included in error logs/alerts. */
  requestContext?: JsonObject;
  timeoutMs?: number;
}

export interface ConnectorHttpResponse<T = unknown> {
  status: number;
  ok: boolean;
  data: T;
  headers: Record<string, string>;
  durationMs: number;
}

export interface ConnectorLogger {
  debug(data: Record<string, unknown>, msg: string): void;
  info(data: Record<string, unknown>, msg: string): void;
  warn(data: Record<string, unknown>, msg: string): void;
  error(data: Record<string, unknown>, msg: string): void;
}

export interface ConnectorEventInput {
  /**
   * Either a core catalog type (`invoice.created`…) or a bare suffix declared
   * in `manifest.events` (the core namespaces it to `connector.<id>.<suffix>`).
   */
  type: string;
  entityType: string;
  entityId: string;
  description: string;
  data?: JsonObject;
}

/**
 * Pay link snapshot handed to connectors. Field names mirror the `pay_links`
 * DB row (snake_case) with dates serialized to ISO strings and JSON columns
 * parsed — porting existing integration code stays mechanical.
 */
export interface PayLinkDto {
  id: string;
  supplier_id: number;
  quote_number: string;
  status: string;
  amount: string;
  amount_ht: string;
  currency: string;
  description: string;
  client_info: { name: string; siret: string; email: string; address?: string };
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    vat_rate: number;
    total: number;
    reference?: string;
  }>;
  metadata: JsonObject | null;
  /** Résultat de l'analyse IA du bon de commande, si disponible. */
  purchase_order_analysis: JsonObject | null;
  test_mode: boolean;
  source: string | null;
  url: string;
  shipping_address: {
    first_name?: string;
    last_name?: string;
    company?: string;
    street?: string;
    postal_code?: string;
    city?: string;
    country?: string;
    email?: string;
    phone?: string;
  } | null;
  scheduled_invoice_date: string | null;
  created_at: string | null;
  accepted_at: string | null;
  expires_at: string | null;
}

export interface CreatePayLinkDto {
  description: string;
  client_info?: { name: string; siret: string; email: string; address?: string };
  /** Amounts (TTC/HT) are derived from the items by the core. */
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    vat_rate: number;
    reference?: string;
  }>;
  metadata?: JsonObject;
  source: string;
  test_mode?: boolean;
  shipping_address?: PayLinkDto["shipping_address"];
  /** ISO date; default +30 days. */
  expires_at?: string;
}

export interface InvoiceDto {
  id: string;
  pay_link_id: string | null;
  status: string;
  amount: string;
  currency: string;
  erp_invoice_id: string | null;
  erp_reference: string | null;
  chorus_reference: string | null;
  invoice_pdf_file_id: string | null;
  created_at: string | null;
}

export interface SupplierProfileDto {
  id: number;
  name: string;
  trade_name: string | null;
  siret: string;
  /** Email de contact PUBLIC du fournisseur (jamais l'email de connexion). */
  email: string;
}

export interface ConnectorCtx {
  installation: ConnectorInstallationInfo;

  config: {
    /** Decrypted, schema-validated installation config. */
    get(): Promise<JsonObject>;
    /**
     * Merge a patch into the installation config (secret fields re-encrypted).
     * For connector-managed mutable state prefer `ctx.kv`.
     */
    update(patch: JsonObject): Promise<void>;
  };

  http: {
    /** Outbound HTTPS restricted to the manifest's allowed domains. */
    fetch<T = unknown>(req: ConnectorHttpRequest): Promise<ConnectorHttpResponse<T>>;
  };

  logger: ConnectorLogger;

  events: {
    emit(event: ConnectorEventInput): Promise<void>;
  };

  oauth: {
    /** Valid access token (auto-refreshed by the core broker) or null. */
    getAccessToken(): Promise<string | null>;
    isConnected(): Promise<boolean>;
    /** URL to send the user to for (re)authorization, null if no oauth block. */
    getAuthorizeUrl(): Promise<string | null>;
  };

  payLinks: {
    get(payLinkId: string): Promise<PayLinkDto | null>;
    create(input: CreatePayLinkDto): Promise<{
      id: string;
      quote_number: string;
      amount: string;
      url: string;
      expires_at: string | null;
    }>;
    /** Find a non-expired pay link by `metadata[key] === value` for a source. */
    findActiveByMetadata(
      source: string,
      key: string,
      value: string
    ): Promise<{ id: string; quote_number: string; amount: string; expires_at: string | null } | null>;
  };

  invoices: {
    findLatestByPayLink(
      payLinkId: string,
      opts?: { withErpId?: boolean }
    ): Promise<InvoiceDto | null>;
    create(input: {
      payLinkId: string;
      amount: string | number;
      currency: string;
      erpInvoiceId?: string;
      erpReference?: string;
    }): Promise<{ invoiceId: string }>;
  };

  suppliers: {
    getProfile(): Promise<SupplierProfileDto>;
  };

  files: {
    /** Store an invoice PDF (S3 + `files` row + link on the invoice). */
    saveInvoicePdf(input: {
      invoiceId: string;
      payLinkId: string;
      pdf: Buffer;
      filename: string;
    }): Promise<string | null>;
    download(fileId: string): Promise<Buffer>;
  };

  kv: {
    get(key: string): Promise<JsonValue | null>;
    set(key: string, value: JsonValue): Promise<void>;
    delete(key: string): Promise<void>;
  };
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

/**
 * Mirrors `IntegrationRequestErrorDetails` — payload/response are typed
 * `unknown` (they must still be JSON-serializable in practice).
 */
export interface ErpRequestErrorDetailsDto {
  integration: string;
  method?: string;
  url?: string;
  status?: number | null;
  durationMs?: number;
  requestPayload?: unknown;
  responseData?: unknown;
  errorName?: string;
  errorMessage?: string;
  errorStack?: string;
  requestContext?: Record<string, unknown>;
}

/**
 * MUST stay structurally identical to `ErpInvoice`
 * (components/erp/erp-manager.tsx) — the four deposit call sites rely on it.
 * Caller contract: `error || !invoiceId` → failure;
 * `!error && !invoiceResult?.invoice` → the connector already deposited to
 * Chorus itself (chorus-direct mode).
 */
export interface ErpInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  invoiceResult: unknown;
  invoicePdfFile: Buffer | null;
  s3FileId?: string;
  error: string | null;
  errorDetails?: ErpRequestErrorDetailsDto | null;
  invoiceDate?: string;
}

export interface ErpInvoiceCapability {
  create(
    ctx: ConnectorCtx,
    input: { payLink: PayLinkDto; payLinkId: string; invoiceDate: string }
  ): Promise<ErpInvoiceResult>;
  downloadPdf?(
    ctx: ConnectorCtx,
    input: { erpInvoiceId: string }
  ): Promise<{ pdf: Buffer | null; error?: string }>;
  syncStatus?(
    ctx: ConnectorCtx,
    input: { erpInvoiceId: string; status: string }
  ): Promise<{ success: boolean; error?: string }>;
}

export interface GateResult {
  success: boolean;
  error?: string;
}

/**
 * Shop gates are BLOCKING calls in the invoice flow; hooks (see
 * `ConnectorDefinition.hooks`) are fire-and-forget. A gate must no-op fast
 * (success) when the pay link doesn't belong to its shop.
 */
export interface ShopCapability {
  /** Quote email sent → e.g. create a draft order. */
  onQuoteConfirmed?(ctx: ConnectorCtx, input: { payLinkId: string }): Promise<GateResult>;
  /** Client accepted → e.g. complete the order; may return a redirect URL. */
  completeOrder?(
    ctx: ConnectorCtx,
    input: { payLinkId: string }
  ): Promise<GateResult & { orderStatusUrl?: string }>;
  /** Runs BEFORE the Chorus deposit; failure skips the deposit (manual retry). */
  preDeposit?(
    ctx: ConnectorCtx,
    input: { payLinkId: string; invoiceId: string | null }
  ): Promise<GateResult>;
}

// ---------------------------------------------------------------------------
// Routes / hooks / actions / cron
// ---------------------------------------------------------------------------

export interface ConnectorIncomingRequest {
  method: string;
  /** Path after the installation prefix, e.g. `/cart`. */
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: JsonValue | string | null;
}

export interface ConnectorRouteResponse {
  status: number;
  headers?: Record<string, string>;
  json?: JsonValue;
  text?: string;
}

export type ConnectorRouteHandler = (
  ctx: ConnectorCtx,
  req: ConnectorIncomingRequest
) => Promise<ConnectorRouteResponse>;

export interface ConnectorEventDto {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  data: JsonObject | null;
  createdAt: string;
}

export type ConnectorHookHandler = (
  ctx: ConnectorCtx,
  event: ConnectorEventDto
) => Promise<void>;

export type ConnectorActionHandler = (
  ctx: ConnectorCtx
) => Promise<{ success: boolean; message?: string }>;

export interface ConnectorCronJob extends ConnectorCronDecl {
  run(ctx: ConnectorCtx): Promise<void>;
}

export interface CheckConnectionResult {
  success: boolean;
  error?: string;
  data?: JsonValue;
}

// ---------------------------------------------------------------------------
// The connector definition (default export of every connector module)
// ---------------------------------------------------------------------------

export interface ConnectorDefinition {
  manifest: ConnectorManifest;
  /** Validates the current config against the live remote API. */
  checkConnection(ctx: ConnectorCtx): Promise<CheckConnectionResult>;
  capabilities?: {
    invoice?: ErpInvoiceCapability;
    shop?: ShopCapability;
  };
  /** Fire-and-forget reactions to core events, e.g. `"invoice.paid"`. */
  hooks?: Record<string, ConnectorHookHandler>;
  /** Inbound routes, keyed `"METHOD /path"` (e.g. `"POST /cart"`). */
  routes?: Record<string, ConnectorRouteHandler>;
  /** Handlers behind `cf.action` config-page buttons. */
  actions?: Record<string, ConnectorActionHandler>;
  /** Scheduled jobs, keyed by job name. */
  cron?: Record<string, ConnectorCronJob>;
}
