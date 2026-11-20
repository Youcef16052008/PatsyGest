/**
 * Revue F-19 : l'application refuse de fonctionner contre un schéma plus ancien
 * que celui qu'elle attend. Pur (sans Supabase) pour être testable.
 */

/** Version de schéma attendue par ce build (migrations 35 et 36 et suivantes). */
export const VERSION_SCHEMA_REQUISE = 36;

export type VerificationSchema =
  | { ok: true; version: number }
  | { ok: false; raison: "absent" | "ancien"; version: number | null; message: string };

/**
 * `ligne` : résultat de `select version from app_schema_version`, `null` si
 * aucune ligne ou table absente (`erreur` renseignée).
 */
export function verifierVersionSchema(
  ligne: { version: unknown } | null,
  erreur: { code?: string } | null,
  requise: number = VERSION_SCHEMA_REQUISE,
): VerificationSchema {
  const absent = (message: string): VerificationSchema => ({ ok: false, raison: "absent", version: null, message });
  if (erreur) return absent(`Base non à jour : la table de version est absente (appliquer la migration ${requise}).`);
  if (!ligne) return absent(`Base non à jour : aucune version de schéma enregistrée (appliquer la migration ${requise}).`);
  const version = Number(ligne.version);
  if (!Number.isInteger(version)) return absent("Version de schéma illisible.");
  if (version < requise) {
    return {
      ok: false,
      raison: "ancien",
      version,
      message: `Base en version ${version}, application attend ${requise} : appliquer les migrations manquantes avant usage.`,
    };
  }
  return { ok: true, version };
}
