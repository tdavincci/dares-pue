#!/usr/bin/env bash
# End-to-end smoke test against a running backend (needs curl + jq).
#   BASE=http://localhost:3000 ./scripts/smoke-test.sh
set -euo pipefail
BASE=${BASE:-http://localhost:3000}
B=$BASE/api/v1
EMAIL=${ADMIN_EMAIL:-admin@dares-pue.local}
PASS=${ADMIN_PASSWORD:-ChangeMe123!}
SUFFIX=$RANDOM
IMEI="35933907$(printf '%07d' $SUFFIX)"
ok() { echo "  ✔ $*"; }
fail() { echo "  ✘ $*"; exit 1; }
json() { curl -sS -H 'content-type: application/json' "$@"; }

echo "Admin login"
TOK=$(json -X POST $B/auth/login -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | jq -r .accessToken)
[ "$TOK" != "null" ] && ok "JWT issued" || fail "login failed"
H="Authorization: Bearer $TOK"

echo "Register farmer + pump"
FID=$(json -X POST $B/admin/farmers -H "$H" -d '{"fullName":"Smoke Test Farmer","phone":"+2348000000000","farmLatitude":9.2035,"farmLongitude":12.4954}' | jq -r .id)
D=$(json -X POST $B/admin/devices -H "$H" -d "{\"serialNumber\":\"SMOKE-$SUFFIX\",\"trackerImei\":\"$IMEI\",\"price\":1000,\"farmerId\":\"$FID\",\"status\":\"ACTIVE\",\"geofenceRadiusMeters\":200}")
DID=$(echo "$D" | jq -r .device.id); KEY=$(echo "$D" | jq -r .ingestKey)
[ "$DID" != "null" ] && ok "pump SMOKE-$SUFFIX registered" || fail "$D"

echo "Ingest positions"
json -X POST $B/ingest/locations -H "X-Device-Key: $KEY" -d '{"latitude":9.2036,"longitude":12.4955}' | jq -e '.stored==1' >/dev/null && ok "on-farm fix stored"
json -X POST $B/ingest/locations -H "X-Device-Key: $KEY" -d '{"latitude":9.30,"longitude":12.60}' | jq -e '.stored==1' >/dev/null && ok "off-farm fix stored"
W=$(curl -sS $B/admin/devices/$DID -H "$H" | jq -r .lastWithinGeofence)
[ "$W" = "false" ] && ok "geofence breach detected" || fail "expected breach, got $W"
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/ingest/locations -H "X-Device-Key: wrong" -H 'content-type: application/json' -d '{"latitude":9,"longitude":12}')
[ "$CODE" = "401" ] && ok "bad device key rejected"

echo "Payments"
json -X POST $B/admin/payments -H "$H" -d "{\"deviceId\":\"$DID\",\"amount\":999,\"method\":\"CASH\"}" | jq -e '.statusCode==400' >/dev/null && ok "wrong amount rejected"
TX=$(json -X POST $B/admin/payments -H "$H" -d "{\"deviceId\":\"$DID\",\"amount\":1000,\"method\":\"CASH\"}" | jq -r .transactionId)
[ "$TX" != "null" ] && ok "full payment $TX recorded"
json -X POST $B/admin/payments -H "$H" -d "{\"deviceId\":\"$DID\",\"amount\":1000,\"method\":\"CASH\"}" | jq -e '.statusCode==409' >/dev/null && ok "second payment rejected"

echo "Odyssey Standard API"
CID=$(json -X POST $B/admin/api-clients -H "$H" -d '{"name":"Smoke Odyssey"}' | jq -r .id)
AT=$(json -X POST $B/admin/api-clients/$CID/tokens -H "$H" -d '{}' | jq -r .token)
FROM=$(date -u -d '-1 hour' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-1H +%Y-%m-%dT%H:%M:%SZ)
TO=$(date -u -d '+5 min' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v+5M +%Y-%m-%dT%H:%M:%SZ)
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$B/odyssey/standard/meter/readings?FROM=$FROM&TO=$TO")
[ "$CODE" = "401" ] && ok "no token → 401"
R=$(curl -sS -H "Authorization: Bearer $AT" "$B/odyssey/standard/meter/readings?FROM=$FROM&TO=$TO&ID=SMOKE-$SUFFIX")
echo "$R" | jq -e '.readings[0].latitude|type=="string"' >/dev/null && ok "readings: $(echo "$R" | jq -c '{total, first:.readings[0]|{meterId,latitude,longitude}}')"
P=$(curl -sS -H "Authorization: Bearer $AT" "$B/odyssey/standard/electricity/payments?FROM=$FROM&TO=$TO&ID=$TX")
echo "$P" | jq -e '.payments[0].amount==1000 and .errors==""' >/dev/null && ok "payments: $(echo "$P" | jq -c '.payments[0]|{transactionId,amount,transactionType}')"
RT=$(json -X POST $B/admin/api-clients/$CID/refresh-token -H "$H" | jq -r .refreshToken)
json -X POST $B/odyssey/standard/token-renewal -d "{\"refreshToken\":\"$RT\"}" | jq -e '.expiresIn>0' >/dev/null && ok "token renewal"
echo "All checks passed."
