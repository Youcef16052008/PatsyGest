// Le schéma Drizzle n'est pas la source de vérité du schéma Supabase.
// Échouer avant toute connexion, y compris si DATABASE_URL est renseignée.
console.error("db:push est désactivé : le schéma Drizzle est incomplet. Utilisez des migrations SQL revues et testées ; ne les appliquez pas au pilote sans procédure de retour arrière validée.");
process.exitCode = 1;
