#!/usr/bin/env bash
# Tar en pg_dump av produksjonsdatabasen (containeren transcribe-db).
#
#   scripts/backup-db.sh [målmappe]
#
# Standard målmappe: ~/backups/nb-transcribe. Beholder de siste $KEEP dumpene (standard 14).
# Gjenoppretting:
#   docker exec -i transcribe-db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < fil.dump
set -euo pipefail

DEST="${1:-$HOME/backups/nb-transcribe}"
KEEP="${KEEP:-14}"
CONTAINER="${CONTAINER:-transcribe-db}"

mkdir -p "$DEST"
file="$DEST/nb-transcribe-$(date +%Y%m%d-%H%M%S).dump"
tmp="$file.partial"

docker exec "$CONTAINER" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$tmp"
mv "$tmp" "$file"
echo "Backup skrevet til $file ($(du -h "$file" | cut -f1))"

# Rydd eldre automatiske dumper (pre-migration-* o.l. røres ikke)
ls -1t "$DEST"/nb-transcribe-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm --
