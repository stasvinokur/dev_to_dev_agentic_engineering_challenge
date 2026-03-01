#!/bin/sh
# SonarQube auto-provisioning: generates API token after startup.
# Runs as an init container — writes token to /shared/sonar-token.
set -e

SONAR_URL="${SONAR_URL:-http://sonarqube:9000}"
SONAR_USER="${SONAR_USER:-admin}"
SONAR_PASS="${SONAR_PASS:-SonarAdmin1!}"
TOKEN_NAME="sonar-gatekeeper-auto"
TOKEN_FILE="/shared/sonar-token"

echo "[sonarqube-init] Waiting for SonarQube to be ready..."

# Wait until SonarQube responds (healthcheck already passed, but double-check)
for i in $(seq 1 30); do
  if curl -sf "${SONAR_URL}/api/system/status" | grep -q UP; then
    echo "[sonarqube-init] SonarQube is ready."
    break
  fi
  echo "[sonarqube-init] Attempt ${i}/30 — waiting 5s..."
  sleep 5
done

# Change default password if still "admin" (SonarQube forces this on first login)
NEW_PASS="${SONAR_PASS:-SonarAdmin1!}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -u "admin:admin" \
  -X POST "${SONAR_URL}/api/authentication/validate")
if [ "${HTTP_CODE}" = "200" ]; then
  # Default password still works — change it (even if old == new, SonarQube accepts this)
  curl -sf -u "admin:admin" \
    -X POST "${SONAR_URL}/api/users/change_password" \
    -d "login=admin&previousPassword=admin&password=${NEW_PASS}" && \
    echo "[sonarqube-init] Default password updated." || true
fi

# Revoke old token with same name (ignore errors if it doesn't exist)
curl -sf -u "${SONAR_USER}:${SONAR_PASS}" \
  -X POST "${SONAR_URL}/api/user_tokens/revoke" \
  -d "name=${TOKEN_NAME}" || true

# Generate new token
echo "[sonarqube-init] Generating token '${TOKEN_NAME}'..."
RESPONSE=$(curl -sf -u "${SONAR_USER}:${SONAR_PASS}" \
  -X POST "${SONAR_URL}/api/user_tokens/generate" \
  -d "name=${TOKEN_NAME}")

# Extract token value (JSON: {"login":"admin","name":"...","token":"sqa_xxx","...})
TOKEN=$(echo "${RESPONSE}" | sed 's/.*"token":"\([^"]*\)".*/\1/')

if [ -z "${TOKEN}" ] || [ "${TOKEN}" = "${RESPONSE}" ]; then
  echo "[sonarqube-init] ERROR: Failed to extract token from response"
  echo "${RESPONSE}"
  exit 1
fi

# Write token to shared volume
echo -n "${TOKEN}" > "${TOKEN_FILE}"
echo "[sonarqube-init] Token saved to ${TOKEN_FILE}"
echo "[sonarqube-init] Done."
