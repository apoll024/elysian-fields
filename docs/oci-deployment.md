# Deploy Sunday to OCI

The app is a static frontend at this stage. It can run on an OCI compute VM using Docker Compose. No database or paid API credentials are required for the design preview.

## Information needed for the actual deployment

- VM IP or hostname, SSH username, and the local path to the SSH key.
- Instance operating system and CPU architecture.
- Desired domain, if available, and whether an existing reverse proxy is in use.

Use the private key from its local path; never commit it or paste its contents into the app.

## Build and run on the VM

After Docker Engine with the Compose plugin is available, clone the private repository using the VM's authorized GitHub access:

```sh
git clone https://github.com/apoll024/fantasy-football.git
cd fantasy-football
cp .env.example .env
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8080/health
```

The default port is bound to loopback. Preview it through a tunnel from your computer:

```sh
ssh -i /path/to/key -L 8080:127.0.0.1:8080 USER@INSTANCE_IP
```

Then open http://127.0.0.1:8080 locally. Adapt the SSH username to the VM image.

For public hosting, put the existing TLS reverse proxy in front of `127.0.0.1:8080`, configure the domain, and permit ports 80/443 in the OCI network security rules and host firewall. An explicit direct HTTP preview can bind `APP_BIND=0.0.0.0` in `.env`; that also requires allowing the chosen port through both firewalls. Real account authentication should launch behind HTTPS.

## Update

```sh
git pull --ff-only
docker compose up -d --build
docker compose ps
```

## Runtime

- Container port: 8080; health endpoint: `/health`.
- Static assets have immutable-style long caching; the entry document is revalidated.
- Runtime uses a non-root Nginx image, read-only root filesystem, temporary writable `/tmp`, and no added Linux capabilities.
- The source image tags are portable build inputs. Verify the VM architecture and image availability during deployment.
- Current state lives in each visitor's browser. Container restarts do not delete browser state; clearing browser storage does.

The container configuration must be verified on the actual OCI host before declaring deployment complete.
