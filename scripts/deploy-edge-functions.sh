#!/usr/bin/env bash
# Deploy the remaining Kcal-pal edge functions and set their secrets in one go.
#
# Prereqs:
#   - Supabase CLI: https://supabase.com/docs/guides/cli  (brew install supabase/tap/supabase)
#   - A local secrets file (NOT committed): copy scripts/deploy.env.example to
#     scripts/deploy.env and fill it in.
#
# Usage:
#   supabase login                 # one-time, opens browser for a token
#   supabase link --project-ref nrfvsfmhzrkrokzzupen
#   bash scripts/deploy-edge-functions.sh
#
# config.toml already sets verify_jwt = false for all three functions, so the
# deploys honor that automatically.

set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="scripts/deploy.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy scripts/deploy.env.example and fill it in." >&2
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

required=(SB_SECRET_KEY ALLOWED_EMAIL VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT)
for v in "${required[@]}"; do
  if [[ -z "${!v:-}" ]]; then echo "deploy.env: $v is not set" >&2; exit 1; fi
done

echo "==> Setting shared secrets"
supabase secrets set \
  ALLOWED_EMAIL="$ALLOWED_EMAIL" \
  SUPABASE_SERVICE_ROLE_KEY="$SB_SECRET_KEY"

echo "==> Setting Eight Sleep secrets"
supabase secrets set \
  EIGHT_SLEEP_EMAIL="${EIGHT_SLEEP_EMAIL:-}" \
  EIGHT_SLEEP_PASSWORD="${EIGHT_SLEEP_PASSWORD:-}"

echo "==> Setting push secrets"
supabase secrets set \
  VAPID_PUBLIC_KEY="$VAPID_PUBLIC_KEY" \
  VAPID_PRIVATE_KEY="$VAPID_PRIVATE_KEY" \
  VAPID_SUBJECT="$VAPID_SUBJECT"

for fn in sync-eight-sleep send-quarterly-push cleanup-orphans; do
  echo "==> Deploying $fn"
  supabase functions deploy "$fn"
done

echo "Done. Now run supabase/setup_crons.sql in the SQL Editor to schedule them."
