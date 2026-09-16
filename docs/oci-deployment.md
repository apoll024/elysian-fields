# Deploy Elysian Fields to OCI

The app is a static frontend at this stage. It runs natively on the OCI compute VM with Caddy managed by systemd. No database or paid API credentials are required for the design preview.

## Information needed for the actual deployment

- VM IP or hostname, SSH username, and the local path to the SSH key.
- Instance operating system and CPU architecture.
- Desired domain, if available, and whether an existing reverse proxy is in use.

Use the private key from its local path; never commit it or paste its contents into the app.

## Build and publish

Build on a trusted workstation and copy only the generated static files to a versioned release directory:

```powershell
npm ci
npm run build
tar.exe -czf elysian-fields-dist.tar.gz -C dist .
scp -i C:\path\to\key elysian-fields-dist.tar.gz ubuntu@INSTANCE_IP:/tmp/
```

On the VM, extract the build and switch the `current` symlink only after extraction succeeds:

```sh
sudo mkdir -p /srv/elysian-fields/releases/RELEASE_ID
sudo tar -xzf /tmp/elysian-fields-dist.tar.gz -C /srv/elysian-fields/releases/RELEASE_ID
sudo chown -R root:root /srv/elysian-fields/releases/RELEASE_ID
sudo find /srv/elysian-fields/releases/RELEASE_ID -type d -exec chmod 755 {} \;
sudo find /srv/elysian-fields/releases/RELEASE_ID -type f -exec chmod 644 {} \;
sudo ln -sfn /srv/elysian-fields/releases/RELEASE_ID /srv/elysian-fields/current
sudo systemctl reload caddy
```

The native Caddy configuration lives at `/etc/caddy/Caddyfile` and serves `/srv/elysian-fields/current`. Validate it with `sudo caddy validate --config /etc/caddy/Caddyfile` before reloading.

Ports 80 and 443 must be permitted in the OCI network security rules and host firewall. Caddy obtains and renews TLS certificates automatically when the configured public hostname resolves to the VM. Real account authentication should launch behind HTTPS.

## Roll back

```sh
sudo ln -sfn /srv/elysian-fields/releases/PREVIOUS_RELEASE /srv/elysian-fields/current
sudo systemctl reload caddy
```

## Runtime

- Caddy runs as its dedicated system user under systemd.
- Static assets have long caching; the entry document is revalidated.
- The web root is owned by root and is read-only to Caddy.
- Current state lives in each visitor's browser. Container restarts do not delete browser state; clearing browser storage does.
