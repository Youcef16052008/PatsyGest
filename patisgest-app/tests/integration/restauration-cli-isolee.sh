#!/usr/bin/env bash
# Expérience CI uniquement : la pile locale ci-dessous est DÉTRUITE puis recréée.
# Aucun secret, aucune base hébergée et aucune donnée réelle ne doivent être utilisés.
set -euo pipefail
: "${DB_URL:?}" "${RUNNER_TEMP:?}" "${PATSYGEST_DISPOSABLE:?}"
[ "$PATSYGEST_DISPOSABLE" = yes ] || exit 1
node -e 'const u=new URL(process.env.DB_URL);if(!["127.0.0.1","localhost","::1"].includes(u.hostname)||u.port!=="54322"||u.pathname!=="/postgres")throw Error("DB_URL non locale ou inattendue")'
root=$(pwd -P)
project="$RUNNER_TEMP/patsygest-isole"
[ -f "$project/supabase/config.toml" ] || { echo 'Projet CLI jetable introuvable' >&2; exit 1; }
grep -qx 'project_id = "patsygest-isole"' "$project/supabase/config.toml" || { echo 'Projet CLI inattendu' >&2; exit 1; }
docker inspect supabase_db_patsygest-isole >/dev/null
work=$(mktemp -d "$RUNNER_TEMP/patsygest-managed-XXXXXX")
umask 077
cleanup() { rm -rf "$work"; rm -f "$RUNNER_TEMP/patsygest-fingerprint.json"; }
trap cleanup EXIT
node tests/integration/empreinte-restauration.mjs capture
cd "$project"
# Les trois dumps CLI ne partagent pas d'instantané ; cet essai exige des
# données immobiles. La sauvegarde réelle nécessite un arrêt des écritures.
supabase db dump --local --role-only -f "$work/roles.sql"
supabase db dump --local -f "$work/schema.sql"
# La documentation Supabase exclut ces deux tables vectorielles gérées :
# ce test n'est donc PAS une restauration complète de ces données.
supabase db dump --local --data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes -f "$work/data.sql"
for file in roles schema data; do test -s "$work/$file.sql"; done
# Vérifier que la restauration consomme bien le coffre et non les originaux.
# Le secret est fictif et la CI ne conserve pas ce fichier en artefact.
export PATSYGEST_BACKUP_PASSPHRASE
PATSYGEST_BACKUP_PASSPHRASE=$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")
tar -C "$work" -cf "$work/source.tar" roles.sql schema.sql data.sql
node "$root/scripts/coffre-sauvegarde.mjs" chiffrer "$work/source.tar" "$work/coffre.pgcgcm"
rm "$work/source.tar" "$work/roles.sql" "$work/schema.sql" "$work/data.sql"
node "$root/scripts/coffre-sauvegarde.mjs" dechiffrer "$work/coffre.pgcgcm" "$work/restaure.tar"
tar -C "$work" -xf "$work/restaure.tar"
rm "$work/restaure.tar"
unset PATSYGEST_BACKUP_PASSPHRASE
# Cette commande ne doit jamais fonctionner hors du projet et conteneur CI ci-dessus.
supabase stop --no-backup
supabase start -x studio,imgproxy,storage-api,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta,inbucket
# Une seule transaction, échec explicite ; la pile neuve fournit les services
# et schémas gérés exclus par le dump CLI.
{
 cat "$work/roles.sql"
 # Ne pas ajouter les droits par défaut de la base Supabase neuve.
 printf '\nALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;\nALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;\n'
 cat "$work/schema.sql"
 printf '\nSET session_replication_role = replica;\n'
 cat "$work/data.sql"
} | docker exec -i supabase_db_patsygest-isole psql -U postgres -d postgres -X --single-transaction --set ON_ERROR_STOP=1 -q
cd "$root"
node tests/integration/empreinte-restauration.mjs compare
