import {
  cf,
  defineConnector,
  type ConnectorCtx,
  type ErpInvoiceResult,
} from "@/lib/connector-sdk";

/**
 * Template de connecteur Chorus Pay — voir doc/connectors/CREATE_CONNECTOR.md.
 *
 * Règles d'or (spec §2) :
 * - N'importer QUE `@/lib/connector-sdk` (jamais la DB, le storage, les libs
 *   internes de l'app) — tout I/O passe par le `ctx`.
 * - Aucune variable mutable au niveau module (le module est partagé entre
 *   tous les fournisseurs) : l'état va dans `ctx.kv` / `ctx.config.update`.
 * - Tout montant envoyé vers Chorus arrondi au centime : Math.round(x*100)/100.
 */
export default defineConnector({
  manifest: {
    id: "mon-connecteur", // kebab-case, unique — devient connector_key
    name: "Mon Connecteur",
    version: "0.1.0",
    category: "erp", // "erp" (facturation) | "shop" (boutique)
    minSdkVersion: "1.0.0",
    description: "Décrivez le logiciel connecté (affiché aux fournisseurs).",
    // Hôtes que ctx.http a le droit d'appeler (HTTPS uniquement).
    allowedDomains: ["api.exemple.com"],
    // Si l'URL de base est fournie par l'utilisateur (instance auto-hébergée) :
    // allowedDomainsFromConfig: ["url"],
    configFields: [
      cf.secret({ key: "apiKey", label: "Clé API", required: true }),
      // cf.url({ key: "url", label: "URL de l'instance", required: true }),
      // cf.select({ key: "env", label: "Environnement", options: [...] }),
      // cf.action({ key: "resync", label: "Resynchroniser" }), → actions.resync
    ],
  },

  /** Doit retourner {success:false} (jamais jeter) quand la config est invalide. */
  async checkConnection(ctx: ConnectorCtx) {
    const config = await ctx.config.get();
    if (!config.apiKey) {
      return { success: false, error: "Clé API requise" };
    }
    try {
      const response = await ctx.http.fetch<{ name: string }>({
        url: "https://api.exemple.com/me",
        headers: { Authorization: `Bearer ${String(config.apiKey)}` },
      });
      return { success: true, data: { account: response.data.name } };
    } catch {
      return { success: false, error: "Erreur lors de la vérification de la connexion" };
    }
  },

  capabilities: {
    invoice: {
      /**
       * Crée la facture dans le logiciel tiers et retourne le contrat
       * ErpInvoiceResult (spec §7) : `error || !invoiceId` = échec ;
       * le PDF retourné sera déposé sur Chorus Pro par le core.
       */
      async create(ctx, { payLink, payLinkId }): Promise<ErpInvoiceResult> {
        const config = await ctx.config.get();
        if (!config.apiKey) {
          return {
            invoiceId: "",
            invoiceNumber: "",
            invoiceResult: null,
            invoicePdfFile: null,
            error: "Clé API non configurée",
          };
        }

        // Idempotence : facture déjà créée pour ce pay link ?
        const existing = await ctx.invoices.findLatestByPayLink(payLinkId, {
          withErpId: true,
        });
        if (existing) {
          return {
            invoiceId: existing.id,
            invoiceNumber: existing.erp_reference ?? "",
            invoiceResult: null,
            invoicePdfFile: null,
            error: null,
          };
        }

        // 1. Créer la facture via l'API du logiciel (ctx.http)
        // 2. Enregistrer la facture locale : await ctx.invoices.create({...})
        // 3. Télécharger le PDF (responseType: "buffer") puis
        //    await ctx.files.saveInvoicePdf({...})
        // 4. Émettre les events utiles : await ctx.events.emit({...})
        void payLink;
        return {
          invoiceId: "",
          invoiceNumber: "",
          invoiceResult: null,
          invoicePdfFile: null,
          error: "Non implémenté",
        };
      },
    },
  },

  // hooks: { "invoice.paid": async (ctx, event) => { ... } },
  // routes: { "POST /webhook": async (ctx, req) => ({ status: 200, json: { ok: true } }) },
  // actions: { resync: async (ctx) => ({ success: true, message: "Resynchronisé" }) },
  // cron: { "sync-statuses": { every: "15m", async run(ctx) { ... } } },
});
