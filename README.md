# Template de connecteur Chorus Pay

Point de départ pour créer un **connecteur Chorus Pay** : un module qui relie
Chorus Pay à un logiciel externe (ERP de facturation ou boutique en ligne).

📖 Documentation : https://choruspay.fr/doc/connecteurs

## Démarrage

```bash
# 1. Utiliser ce repo comme template (bouton GitHub "Use this template")
#    ou le cloner puis renommer
git clone https://github.com/VOTRE_ORG/chorus-pay-connector-template mon-logiciel
cd mon-logiciel && npm install

# 2. Implémenter votre connecteur dans index.ts
#    (manifest.id = identifiant unique et définitif de votre connecteur)

# 3. Vérifier types + conformité au protocole
npm run typecheck
npm test

# 4. Empaqueter en zip
npm run build      # → dist/<id>-<version>.zip
```

## Structure

| Chemin | Rôle |
|---|---|
| `index.ts` | Votre connecteur (`export default defineConnector({...})`) |
| `sdk/` | Le SDK Chorus Pay (contrat `ctx`, `defineConnector`, `cf.*`) — ne pas modifier |
| `testkit/` | Kit de conformité + mock du `ctx` pour vos tests |
| `scripts/` | build (bundle + zip), test (conformité), sign/verify (signature) |

## Règles essentielles

1. **N'importer que le SDK** (`@/lib/connector-sdk`) — tout passe par le `ctx`.
2. **Pas d'état global mutable** : le module est partagé entre tous les comptes.
3. **Jamais planter** sur une config invalide : retourner `{ success: false, error }`.
4. **Montants arrondis au centime** (`Math.round(x * 100) / 100`) — Chorus Pro
   affiche les décimales résiduelles sur la facture.
5. Déclarer dans `manifest.allowedDomains` les seuls domaines appelés.

## Publication

Votre zip est **relu et signé par Chorus Pay** avant d'être publié (au
catalogue public, ou en connecteur privé visible uniquement par votre compte).
Envoyez le zip produit par `npm run build` avec un lien vers votre repo —
contact : voir https://choruspay.fr/doc/connecteurs.
