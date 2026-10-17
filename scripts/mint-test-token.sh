#!/bin/bash
#
# Print an access token for the DAON end-to-end test account.
#
# Registration requires an account, so the scripts that register against
# production (test-remote-e2e.sh, run-load-tests.sh) sign in as this one.
# Everything they register is owned by it, so it can be found and erased --
# and none of it is mixed in with real people's works.
#
# The account is created on first use. Its address is on example.com, which is
# reserved and never receives mail, and is not an admin domain.
#
# The token is minted inside the API container with the API's own code and
# secret, so it is exactly what a login would issue.
#
# Usage:
#   ./scripts/mint-test-token.sh            # 15-minute token
#   ./scripts/mint-test-token.sh 3600       # lifetime in seconds
#
set -euo pipefail

DAON_SERVER="${DAON_SERVER:-daon}"
TEST_EMAIL="${DAON_TEST_EMAIL:-e2e-test@example.com}"
LIFETIME="${1:-900}"

[[ "$LIFETIME" =~ ^[0-9]+$ ]] || { echo "lifetime must be seconds" >&2; exit 1; }
[[ "$TEST_EMAIL" =~ ^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+$ ]] || { echo "bad DAON_TEST_EMAIL" >&2; exit 1; }

ssh "$DAON_SERVER" bash -s -- "$TEST_EMAIL" "$LIFETIME" <<'REMOTE'
set -euo pipefail
email="$1"
lifetime="$2"

id=$(docker exec -i daon-postgres psql -U daon_api -d daon_production \
       -v ON_ERROR_STOP=1 -qtA -v email="$email" <<'SQL'
INSERT INTO users (email, username, email_verified)
VALUES (:'email', 'daon-e2e', true)
ON CONFLICT (email) DO NOTHING;
SELECT id FROM users WHERE email = :'email';
SQL
)
[[ "$id" =~ ^[0-9]+$ ]] || { echo "could not find or create the test account" >&2; exit 1; }

# The API image runs its TypeScript source with tsx (api-server/Dockerfile,
# `npx tsx src/server.ts`); there is no compiled dist/ in it.
docker exec -e ACCESS_TOKEN_LIFETIME="$lifetime" -e DAON_E2E_USER_ID="$id" daon-api-1 \
  npx tsx -e \
  "import('/app/src/utils/jwt.ts').then(m => console.log(m.generateAccessToken(Number(process.env.DAON_E2E_USER_ID))))" \
  | tail -n 1
REMOTE
