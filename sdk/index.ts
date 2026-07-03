/**
 * Chorus Pay Connector SDK.
 *
 * A connector is a module whose default export is `defineConnector({...})`.
 * See doc/connectors/CONNECTOR_SPEC.md for the full protocol and
 * doc/connectors/CREATE_CONNECTOR.md for the developer guide.
 *
 * This package must not import anything from the app — it is bundled into
 * every connector zip and must stay extractable to its own repo.
 */

export * from "./types";
export {
  cf,
  buildConfigSchema,
  validateConfig,
  flattenFields,
  listSecretKeys,
} from "./config-fields";
export {
  defineConnector,
  serializeManifest,
  compareSemver,
  parseCronInterval,
  SDK_VERSION,
} from "./define";
export {
  ConnectorError,
  ConnectorPermissionError,
  ConnectorConfigError,
  ConnectorHttpError,
} from "./errors";
