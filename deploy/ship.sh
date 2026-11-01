#!/usr/bin/env bash
# Ship Bluff Club to https://bluffclub.heronevents.app (deploy/RUNBOOK.md).
#
#   deploy/ship.sh            build this commit, ship it, start it, check it
#   BUILD_ON_HOST=1 deploy/ship.sh   the same, but build on the host (slow uplinks, venue Wi-Fi)
#   FORCE=1 deploy/ship.sh    deploy even while rooms have people in them (it ends their games)
#   deploy/ship.sh rollback   run the previous image tag again
#   deploy/ship.sh status     what is running on the host, and its disk
#
# BLUFFCLUB_HOST (ec2-user@<host>) and BLUFFCLUB_KEY (the ssh key) must be set; the host is the
# one in HeronEvents' deploy/RUNBOOK.md. Builds the image here for linux/arm64 (the Mac and the
# host are both arm64), tagged with the short commit, and loads it on the host with
# docker save | gzip | ssh docker load. Touches only the bluffclub project, its images and
# /data/bluffclub. A deploy restarts the container, which ends every room in play.
set -euo pipefail

HOST="${BLUFFCLUB_HOST:?set BLUFFCLUB_HOST=ec2-user@<host> (deploy/RUNBOOK.md)}"
KEY="${BLUFFCLUB_KEY:?set BLUFFCLUB_KEY to the host ssh key}"
URL="${BLUFFCLUB_URL:-https://bluffclub.heronevents.app}"
MAX_DISK_PCT="${BLUFFCLUB_MAX_DISK_PCT:-85}"
REMOTE=/data/bluffclub

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf '\n== %s\n' "$*"; }
die() {
  printf '\nship: %s\n' "$*" >&2
  exit 1
}
remote() { ssh -i "$KEY" -o ConnectTimeout=15 -o BatchMode=yes -o LogLevel=ERROR "$HOST" "$@"; }

# /data holds Docker's data and the other products' databases. Refuse past the limit.
check_disk() {
  local pct
  pct="$(remote "df --output=pcent /data | tail -1 | tr -dc 0-9")"
  echo "/data on the host is ${pct}% full (limit ${MAX_DISK_PCT}%)"
  [ "$pct" -le "$MAX_DISK_PCT" ] || die "/data is over ${MAX_DISK_PCT}%: not shipping. Remove old bluffclub-web images; never anyone else's."
}

# The status endpoint through Cloudflare, the tunnel and the container, until it says the
# OpenAI key is set (or that demo mode is on).
check_health() {
  local body="" attempt
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    # When this Mac still caches a lookup from before the DNS record existed, ask 1.1.1.1 instead:
    # the check is of the site, not of this Mac's cache.
    body="$(curl -sS --max-time 10 "$URL/api/game?status=1" 2>&1)" || {
      local host="${URL#https://}" ip
      host="${host%%/*}"
      ip="$(dig +short "$host" @1.1.1.1 | grep -E '^[0-9.]+$' | head -1)"
      body="$(curl -sS --max-time 10 --resolve "$host:443:$ip" "$URL/api/game?status=1" 2>&1 || true)"
    }
    if python3 -c 'import json, sys; d = json.loads(sys.argv[1]); sys.exit(0 if d.get("ready") or d.get("demo") else 1)' "$body" 2>/dev/null; then
      echo "GET $URL/api/game?status=1 -> $body"
      python3 -c 'import json, sys; sys.exit(0 if json.loads(sys.argv[1]).get("passwordRequired") else 1)' "$body" \
        || echo "note: HOST_PASSWORD is empty, so anyone can host (and spend the OpenAI key)."
      return 0
    fi
    echo "  attempt $attempt/10: ${body:-<no response>}"
    sleep 3
  done
  die "$URL/api/game?status=1 is not ready. Logs: ssh in and run $REMOTE/dc logs --tail 100"
}

status() {
  remote "cat $REMOTE/release.env 2>/dev/null; $REMOTE/dc ps --all; df -h /data | tail -1; docker images --filter 'reference=bluffclub-*'"
}

rollback() {
  say "rolling back on $HOST"
  remote 'bash -s' <<'EOF'
set -euo pipefail
cd /data/bluffclub
exec 9>.ship.lock
flock -n 9 || { echo "another deploy holds /data/bluffclub/.ship.lock" >&2; exit 1; }
cur="$(sed -n 's/^IMAGE_TAG=//p' release.env)"
prev="$(sed -n 's/^PREVIOUS_IMAGE_TAG=//p' release.env)"
[ -n "$prev" ] || { echo "release.env has no PREVIOUS_IMAGE_TAG: nothing to roll back to" >&2; exit 1; }
docker image inspect "bluffclub-web:$prev" >/dev/null || { echo "bluffclub-web:$prev is not loaded on this host" >&2; exit 1; }
printf 'IMAGE_TAG=%s\nPREVIOUS_IMAGE_TAG=%s\n' "$prev" "$cur" >release.env.new
mv release.env.new release.env
echo "IMAGE_TAG $cur -> $prev"
./dc up -d --wait --wait-timeout 180
EOF
  check_health
  say "ROLLED BACK. Ship again with: deploy/ship.sh"
}

ship() {
  local tag image
  tag="$(git rev-parse --short=12 HEAD)"
  [ -z "$(git status --porcelain)" ] || die "the checkout has uncommitted changes. Commit them first: the image tag is the commit."
  image="bluffclub-web:$tag"

  say "checking the host ($HOST)"
  check_disk
  remote "set -e
    test -f $REMOTE/.env || { echo 'no $REMOTE/.env: see deploy/RUNBOOK.md, First-time setup' >&2; exit 1; }
    [ \"\$(stat -c %a $REMOTE/.env)\" = 600 ] || { echo '$REMOTE/.env must be chmod 600' >&2; exit 1; }
    docker network inspect heronmeet >/dev/null || { echo 'no heronmeet network: Heron Connect must be running' >&2; exit 1; }
    echo 'OK: .env (600) and the heronmeet network'"

  if [ "${BUILD_ON_HOST:-0}" = 1 ]; then
    # On a slow connection (venue Wi-Fi): send the committed source, a few MB, not the ~400 MB
    # image, and let the host (arm64, fast network) build it.
    say "building $image on the host"
    git archive --format=tar HEAD | gzip -1 \
      | remote "rm -rf $REMOTE/build && mkdir -p $REMOTE/build && tar -xzf - -C $REMOTE/build"
    remote "set -e; cd $REMOTE/build; docker build --platform linux/arm64 -t $image .; rm -rf $REMOTE/build"
  else
    say "building $image for linux/arm64"
    docker build --platform linux/arm64 -t "$image" .

    say "shipping the image"
    if [ "$(docker image inspect -f '{{.Id}}' "$image")" = "$(remote "docker image inspect -f '{{.Id}}' $image 2>/dev/null" || true)" ]; then
      echo "the host already has this exact image"
    else
      docker save "$image" | gzip -1 | remote 'gunzip | docker load'
    fi
  fi
  check_disk

  say "copying compose and dc to $REMOTE"
  scp -q -i "$KEY" -o BatchMode=yes -o LogLevel=ERROR deploy/compose.prod.yml deploy/dc "$HOST:$REMOTE/"
  remote "chmod +x $REMOTE/dc"

  say "starting $tag"
  # Unquoted heredoc: $tag is filled in here; \$ runs on the host.
  remote 'bash -s' <<EOF
set -euo pipefail
cd $REMOTE
exec 9>.ship.lock
flock -n 9 || { echo "another deploy holds $REMOTE/.ship.lock" >&2; exit 1; }
touch release.env
IMAGE_TAG=$tag ./dc config --quiet
# Rooms live in memory: restarting ends every game in play. Refuse while anyone is in a room, unless FORCE=1.
if [ "${FORCE:-0}" != 1 ] && cid="\$(./dc ps -q bluffclub 2>/dev/null)" && [ -n "\$cid" ]; then
  live="\$(docker exec "\$cid" node -e "fetch('http://127.0.0.1:3000/api/game?status=1').then(r=>r.json()).then(d=>console.log(d.live||0),()=>console.log(0))")"
  [ "\$live" = 0 ] || { echo "\$live room(s) have people in them; deploying now would end their games. Try again later, or FORCE=1." >&2; exit 3; }
fi
# Our service names become DNS names on the heronmeet network. One that matches a heronmeet service
# (a second \`web\`) would take a share of heronevents.app's traffic.
theirs="\$(docker ps -a --filter label=com.docker.compose.project=heronmeet --format '{{.Label "com.docker.compose.service"}}' | sort -u)"
for svc in \$(IMAGE_TAG=$tag ./dc config --services); do
  if printf '%s\n' "\$theirs" | grep -qx "\$svc"; then echo "service \$svc clashes with heronmeet's \$svc on the heronmeet network" >&2; exit 1; fi
done
cur="\$(sed -n 's/^IMAGE_TAG=//p' release.env)"
prev="\$(sed -n 's/^PREVIOUS_IMAGE_TAG=//p' release.env)"
[ -n "\$cur" ] && [ "\$cur" != "$tag" ] && prev="\$cur"
printf 'IMAGE_TAG=%s\nPREVIOUS_IMAGE_TAG=%s\n' "$tag" "\$prev" >release.env.new
mv release.env.new release.env
echo "IMAGE_TAG=$tag PREVIOUS_IMAGE_TAG=\${prev:-<none>}"
./dc up -d --remove-orphans --wait --wait-timeout 180
got="\$(docker inspect -f '{{.Config.Image}}' "\$(./dc ps -q bluffclub)")"
[ "\$got" = "$image" ] || { echo "bluffclub runs \$got, not $image" >&2; exit 1; }
echo "OK: bluffclub runs \$got"
# Old bluffclub tags go; this one and the previous stay for rollback. Ours only.
docker images --filter 'reference=bluffclub-web' --format '{{.Repository}}:{{.Tag}}' | while read -r old; do
  case "\${old#*:}" in
    "$tag" | "\$prev") ;;
    *) if docker rmi "\$old" >/dev/null 2>&1; then echo "removed \$old"; else echo "kept \$old (in use)"; fi ;;
  esac
done
EOF

  say "checking $URL from outside"
  check_health
  say "DEPLOYED $tag. Roll back with: deploy/ship.sh rollback"
}

case "${1:-ship}" in
  ship) ship ;;
  rollback) rollback ;;
  status) status ;;
  *)
    echo "usage: $0 [ship|rollback|status]" >&2
    exit 2
    ;;
esac
