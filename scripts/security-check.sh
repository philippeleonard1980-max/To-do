#!/usr/bin/env bash
# Access-control checks against a running instance.
#
# Verifies that anonymous and ordinary users cannot reach the admin panel or
# its API, that no admin content leaks into their page payloads, that the
# self-service profile endpoint cannot grant role/credits/plan, that an admin
# cannot lock themselves out, and that a suspension revokes a live session.
#
# Requires the seeded demo account to hold the admin role:
#   npm run admin:grant -- demo@aitalk.local
#
#   npm run build && npm start &
#   BASE=http://localhost:3000 bash scripts/security-check.sh
#
# Exits non-zero if any check fails.

set -u
B="${BASE:-http://127.0.0.1:3000}"
S="$(mktemp -d)"
D="$S/bodies"
mkdir -p "$D"
printf '{"action":"suspend","reason":"security test"}' > "$D/suspend.json"
printf '{"action":"unsuspend"}'                        > "$D/unsuspend.json"
printf '{"action":"setRole","role":"user"}'            > "$D/demote.json"
printf '{"action":"delete"}'                           > "$D/delchar.json"
printf '{"status":"reviewed"}'                         > "$D/review.json"
printf '{"role":"admin","credits":999999,"plan":"pro"}' > "$D/escalate.json"
printf '{not valid json'                               > "$D/malformed.json"
PASS=0; FAIL=0
chk(){ if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf "  PASS  %-56s %s\n" "$1" "$3";
       else FAIL=$((FAIL+1)); printf "  FAIL  %-56s got=%s want=%s\n" "$1" "$3" "$2"; fi; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
JH='Content-Type: application/json'

U=$S/u2.txt; A=$S/a2.txt; rm -f $U $A
EMAIL="sec-$(date +%s%N)@test.local"

echo "--- anonymous ---"
chk "anon /admin -> 307 login" "307" "$(code $B/admin)"
chk "anon PATCH admin api -> 404" "404" "$(code -X PATCH -H "$JH" --data-binary @$D/unsuspend.json $B/api/admin/users/x)"

echo "--- ordinary user ---"
curl -s -c $U -b $U -X POST $B/api/auth/register -H "$JH" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"secpassword123\",\"displayName\":\"Sec Two\"}" >/dev/null
TARGET=$(curl -s -b $U $B/api/me | python3 -c "import sys,json;v=json.load(sys.stdin)['viewer'];print(v['id'] if v else '')")
[ -z "$TARGET" ] && { echo "  ABORT: test account was not created"; exit 1; }
chk "user PATCH /api/admin/users -> 404"      "404" "$(code -b $U -X PATCH -H "$JH" --data-binary @$D/suspend.json  $B/api/admin/users/$TARGET)"
chk "user PATCH /api/admin/characters -> 404" "404" "$(code -b $U -X PATCH -H "$JH" --data-binary @$D/delchar.json  $B/api/admin/characters/x)"
chk "user PATCH /api/admin/reports -> 404"    "404" "$(code -b $U -X PATCH -H "$JH" --data-binary @$D/review.json   $B/api/admin/reports/x)"

echo "--- no admin page content leaks to a normal user ---"
curl -s -b $U $B/admin > $S/leak.html
LEAK=$(grep -oE "Recent moderator|Granting admin|admin:grant|Open reports" $S/leak.html | wc -l | tr -d ' ')
chk "zero admin strings in /admin payload"        "0" "$LEAK"
curl -s -b $U $B/admin/users > $S/leak2.html
LEAK2=$(grep -oE "$EMAIL|demo@aitalk.local|suspendedReason" $S/leak2.html | wc -l | tr -d ' ')
chk "zero account data in /admin/users payload"   "0" "$LEAK2"

echo "--- privilege escalation attempts ---"
curl -s -b $U -X PATCH $B/api/me -H "$JH" --data-binary @$D/escalate.json >/dev/null
AFTER=$(curl -s -b $U $B/api/me | python3 -c "import sys,json;v=json.load(sys.stdin)['viewer'];print(v['role'],v['credits'],v['plan'])")
chk "PATCH /api/me cannot set role/credits/plan" "user 300 free" "$AFTER"

echo "--- malformed body is a client error, not a 500 ---"
chk "malformed JSON -> 400" "400" "$(code -b $U -X PATCH -H "$JH" --data-binary @$D/malformed.json $B/api/me)"

echo "--- admin access ---"
curl -s -c $A -b $A -X POST $B/api/auth/login -H "$JH" -d '{"email":"demo@aitalk.local","password":"demo1234"}' >/dev/null
for p in /admin /admin/users /admin/reports /admin/characters /admin/audit; do
  chk "admin GET $p -> 200" "200" "$(code -b $A $B$p)"
done
AID=$(curl -s -b $A $B/api/me | python3 -c "import sys,json;print(json.load(sys.stdin)['viewer']['id'])")
chk "admin cannot suspend self" "400" "$(code -b $A -X PATCH -H "$JH" --data-binary @$D/suspend.json $B/api/admin/users/$AID)"
chk "admin cannot demote self"  "400" "$(code -b $A -X PATCH -H "$JH" --data-binary @$D/demote.json  $B/api/admin/users/$AID)"

echo "--- suspension revokes a live session ---"
chk "admin suspends user" "200" "$(code -b $A -X PATCH -H "$JH" --data-binary @$D/suspend.json $B/api/admin/users/$TARGET)"
SUSP=$(curl -s -b $U $B/api/me | python3 -c "import sys,json;print(json.load(sys.stdin)['viewer'])")
chk "suspended session resolves to null" "None" "$SUSP"
chk "suspended user blocked from writes" "401" "$(code -b $U -X POST -H "$JH" -d '{"name":"X","tags":[]}' $B/api/characters)"
chk "admin unsuspends" "200" "$(code -b $A -X PATCH -H "$JH" --data-binary @$D/unsuspend.json $B/api/admin/users/$TARGET)"

echo "--- stored API keys never leave the server ---"
# Save a key directly (bypassing validation, which would reject a fake one),
# then confirm no surface hands the plaintext back.
FAKE="AIzaFAKEKEYVALUE1234567890abcdefGHIJ"
node -e '
const { PrismaClient } = require("@prisma/client");
const { createCipheriv, randomBytes, scryptSync } = require("node:crypto");
require("dotenv").config?.();
const secret = process.env.AUTH_SECRET || require("fs").readFileSync(".env","utf8").match(/AUTH_SECRET="?([^"\n]+)/)[1];
const key = scryptSync(secret, "aitalk.apikeys.v1", 32);
const iv = randomBytes(12);
const c = createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([c.update(process.argv[2], "utf8"), c.final()]);
const enc = [iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
const p = new PrismaClient();
p.user.update({ where: { email: "demo@aitalk.local" }, data: { geminiKeyEnc: enc } })
 .then(() => p.$disconnect());
' "$FAKE" 2>/dev/null

KEYS_JSON=$(curl -s -b $A "$B/api/me/keys")
echo "$KEYS_JSON" | grep -q "$FAKE" && chk "GET /api/me/keys withholds the plaintext key" "withheld" "LEAKED" || chk "GET /api/me/keys withholds the plaintext key" "withheld" "withheld"
echo "$KEYS_JSON" | grep -q '"masked"' && chk "…but does return a masked preview" "yes" "yes" || chk "…but does return a masked preview" "yes" "no"

SETTINGS_HTML=$(curl -s -b $A "$B/settings")
echo "$SETTINGS_HTML" | grep -q "$FAKE" && chk "settings page HTML withholds the key" "withheld" "LEAKED" || chk "settings page HTML withholds the key" "withheld" "withheld"

ME_JSON=$(curl -s -b $A "$B/api/me")
echo "$ME_JSON" | grep -qiE "KeyEnc|$FAKE" && chk "/api/me exposes no key material" "clean" "LEAKED" || chk "/api/me exposes no key material" "clean" "clean"

chk "another user cannot read your keys (401 when signed out)" "401" "$(code "$B/api/me/keys")"

echo "--- audit trail ---"
N=$(curl -s -b $A $B/admin/audit | grep -oE "user\.suspend|user\.unsuspend" | wc -l | tr -d ' ')
if [ "$N" -ge 2 ]; then chk "audit recorded both actions" "ok" "ok"; else chk "audit recorded both actions" "ok" "only $N"; fi

echo; echo "=============================================="
echo "   PASSED: $PASS    FAILED: $FAIL"
echo "=============================================="
[ "$FAIL" -eq 0 ] || exit 1
