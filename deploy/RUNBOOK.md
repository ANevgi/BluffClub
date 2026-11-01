# Bluff Club in production: runbook

https://bluffclub.heronevents.app runs as one container on the shared EC2 host that already
runs Heron Connect (`heronmeet`), beside other products. Everything of ours there is named `bluffclub`.
**Touch nothing else**, and read the "Never, on this host" list in HeronEvents' `deploy/RUNBOOK.md` before your first deploy.

| What | Where |
|---|---|
| Host | The one in HeronEvents' `deploy/RUNBOOK.md`. `deploy/ship.sh` takes it from `BLUFFCLUB_HOST=ec2-user@<host>` and the key from `BLUFFCLUB_KEY` |
| Our files | `/data/bluffclub`: `compose.prod.yml`, `.env` (secrets, 600), `release.env` (image tags), `dc` |
| Compose | project `bluffclub`: one service, `bluffclub` (Next.js, :3000). No host ports. Joins the external `heronmeet` network, where its service name is its DNS name. Never name a service like one of heronmeet's (`web`, `api`, `db`…): it would take a share of their traffic. `ship.sh` checks |
| Ingress | the `heronmeet` tunnel routes `bluffclub.heronevents.app` to `http://bluffclub:3000` (HeronEvents' `deploy/cloudflared/config.yml`). DNS: a proxied CNAME `bluffclub` → `<heronmeet tunnel id>.cfargotunnel.com` in the `heronevents.app` zone |
| Images | `bluffclub-web:<commit>`, built on the Mac. The live tag and the previous one are in `release.env` |
| State | In memory only. A deploy or restart ends every room in play: **don't ship during a game** |

## Capacity

One room holds 12 players and up to 300 audience. A full game with 12 players and 188
audience phones (`node scripts/load-test.mjs <url> 188`, in demo mode) peaked at 15% of one
core and 150 MB: phones poll a few KB of state, and drawings and generated images are served
once each from `/img/<room>-<key>.png`, which Cloudflare caches at the edge.

The whole audience shares the venue's IP address, so never put a per-IP rate limit, Bot
Fight Mode or a challenge on this hostname. The zone's existing rate-limit rule only covers
Heron Connect's `/api/auth/*` and `/api/me/photo`.

## First-time setup

1. **Secrets.** On the host, create the env file, then pipe the values in with Heron
   Connect's `env-set.py`, which never prints them:

   ```bash
   H 'mkdir -p /data/bluffclub && install -m 600 /dev/null /data/bluffclub/.env'
   printf 'OPENAI_API_KEY=%s\nHOST_PASSWORD=%s\n' "$OPENAI_API_KEY" "$HOST_PASSWORD" \
     | H HERONMEET_ENV_FILE=/data/bluffclub/.env python3 /data/heronmeet/env-set.py
   ```

   `OPENAI_TEXT_MODEL` and `OPENAI_IMAGE_MODEL` go in the same way if the defaults are not
   available to the key. Production leaves `HOST_PASSWORD` empty so anyone can host: anyone
   with the link can then spend the key, up to 30 rooms at a time. Set it to require a password.

2. **Route.** In HeronEvents' `deploy/cloudflared/config.yml`, above the catch-all:

   ```yaml
     - hostname: bluffclub.heronevents.app
       service: http://bluffclub:3000
   ```

   Commit it and ship Heron Connect (`make ship`), which restarts its connector. Do it
   outside an event: Heron Connect drops for a few seconds.

3. **DNS.** Cloudflare dashboard, zone `heronevents.app`: add a proxied CNAME `bluffclub` to
   `<heronmeet tunnel id>.cfargotunnel.com` (the id is `tunnel:` in that `config.yml`).

4. **Ship:** `BLUFFCLUB_HOST=… BLUFFCLUB_KEY=… deploy/ship.sh`.

## Deploy, roll back, look

```bash
deploy/ship.sh            # build this commit for linux/arm64, load it on the host, start it, check it
BUILD_ON_HOST=1 deploy/ship.sh   # the same, but send the source and build on the host: use this on venue Wi-Fi
deploy/ship.sh rollback   # the previous tag again
deploy/ship.sh status     # tags, container, disk
H /data/bluffclub/dc logs -f --tail 100 bluffclub
```

`ship.sh` refuses an uncommitted checkout, a `/data` over 85% full, or a moment when any room has people in it (a restart ends their games; `FORCE=1` overrides), and checks
`https://bluffclub.heronevents.app/api/game?status=1` from outside when it is done.

## Change a setting

```bash
printf 'HOST_PASSWORD=%s\n' "$value" | H HERONMEET_ENV_FILE=/data/bluffclub/.env python3 /data/heronmeet/env-set.py
H /data/bluffclub/dc up -d --force-recreate bluffclub   # re-reads .env; ends every room in play
```

`H` means `ssh -i "$BLUFFCLUB_KEY" "$BLUFFCLUB_HOST"`.
