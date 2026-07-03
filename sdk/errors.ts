/**
 * SDK error types. Because a future isolate/RPC boundary cannot preserve
 * `instanceof`, errors carry a stable `code` — match on `error.code`, not on
 * the class.
 */

export type ConnectorErrorCode =
  | "connector_error"
  | "permission_denied"
  | "config_invalid"
  | "http_error"
  | "timeout";

export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;

  constructor(message: string, code: ConnectorErrorCode = "connector_error") {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
  }
}

/** Thrown by ctx when a call exceeds the connector's capabilities (e.g. a non-allowed domain). */
export class ConnectorPermissionError extends ConnectorError {
  constructor(message: string) {
    super(message, "permission_denied");
    this.name = "ConnectorPermissionError";
  }
}

/** Thrown when the installation config fails the connector's schema. */
export class ConnectorConfigError extends ConnectorError {
  constructor(message: string) {
    super(message, "config_invalid");
    this.name = "ConnectorConfigError";
  }
}

/** Thrown by `ctx.http.fetch` on non-2xx/network failure (serializable details). */
export class ConnectorHttpError extends ConnectorError {
  readonly status?: number;
  readonly url?: string;
  readonly responseData?: unknown;

  constructor(
    message: string,
    details: { status?: number; url?: string; responseData?: unknown } = {}
  ) {
    super(message, "http_error");
    this.name = "ConnectorHttpError";
    this.status = details.status;
    this.url = details.url;
    this.responseData = details.responseData;
  }
}
