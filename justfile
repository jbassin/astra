# astra task runner.
#
# The production edge is the SHARED host reverse proxy at /ruby/data/reverse-proxy
# (a custom `caddy` binary built with the cloudflare-dns plugin — the stock
# /usr/bin/caddy lacks it). Its Caddyfile `import`s this repo's sites.caddyfile.
# These recipes reload/validate that edge with astra's sites, sourcing the
# Cloudflare ACME-DNS token from SOPS (never from a committed file).

reverse_proxy_dir := "/ruby/data/reverse-proxy"
sops_age_key := "deploy/sops/age.key"
sops_file := "deploy/sops/secrets.enc.yaml"

# The decrypted CF token, exported as {$CF_API_TOKEN} for the caddyfile adapter.
cf_token := "CF_API_TOKEN=\"$(SOPS_AGE_KEY_FILE=" + sops_age_key + " sops -d --extract '[\"cloudflare_key\"]' " + sops_file + ")\""

# Reload the shared reverse proxy (applies astra's sites + everything else it
# imports). Token is substituted at adapt time, so it lands in the JSON sent to
# the running daemon and is never written to disk.
caddy-reload:
    {{cf_token}} {{reverse_proxy_dir}}/caddy reload --config {{reverse_proxy_dir}}/Caddyfile --adapter caddyfile

# Validate astra's sites.caddyfile in isolation (adapt-only; no provisioning).
caddy-validate:
    {{cf_token}} {{reverse_proxy_dir}}/caddy validate --config sites.caddyfile --adapter caddyfile

# Tail the edge logs (mirrors the reverse-proxy justfile's `logs`).
caddy-logs:
    journalctl -fu caddy.service
