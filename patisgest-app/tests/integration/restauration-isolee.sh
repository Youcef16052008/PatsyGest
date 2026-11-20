#!/usr/bin/env bash
# Répétition strictement locale et jetable. Ne lit aucun secret de production.
set -euo pipefail
: "${DB_URL:?DB_URL de la pile Supabase CLI jetable requis}"
: "${RUNNER_TEMP:?répertoire temporaire du runner requis}"
[ "${PATSYGEST_DISPOSABLE:-}" = yes ] || { echo 'Pile jetable obligatoire' >&2; exit 1; }
node -e 'const u=new URL(process.env.DB_URL);if(!["127.0.0.1","localhost","::1"].includes(u.hostname)||u.port!=="54322"||u.pathname!=="/postgres")throw Error("DB_URL non locale ou inattendue")'
# On ne détruit que la base nommée ci-dessous dans le conteneur CLI exact.
container=supabase_db_patsygest-isole
docker inspect "$container" >/dev/null
# Diagnostic de droits sans informations de connexion ni données client.
docker exec "$container" psql -U postgres -d postgres -c "select rolname, rolsuper, rolcreaterole, rolcreatedb from pg_roles where rolname in ('postgres','supabase_admin') order by rolname"
archive="$RUNNER_TEMP/patsygest-restore-trial.pgc"
umask 077
created=false
cleanup() {
  rm -f "$archive"
  if [ "$created" = true ]; then
    docker exec "$container" dropdb -U postgres --if-exists --force patsy_restore_trial >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
# Refuser une base préexistante au lieu de l'écraser.
exists=$(docker exec "$container" psql -U postgres -d postgres -Atc "select count(*) from pg_database where datname='patsy_restore_trial'")
[ "$exists" = 0 ] || { echo 'Base de répétition déjà présente : arrêt' >&2; exit 1; }
docker exec "$container" createdb -U postgres -T template0 patsy_restore_trial
created=true
# Contrairement au workflow historique, conserver les ACL. Les propriétaires
# ne sont pas restaurés (--no-owner) : ce test ne certifie pas leur équivalence.
docker exec "$container" pg_dump -U postgres -d postgres --format=custom --no-owner > "$archive"
test -s "$archive"
docker exec -i "$container" pg_restore -U postgres -d patsy_restore_trial --no-owner --exit-on-error --single-transaction < "$archive"
node tests/integration/verifier-restauration.mjs
