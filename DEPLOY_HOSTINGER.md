# Deploy Open Generative AI to `ai.tatpc.ca` on Hostinger

This fork adds a server-side ComfyUI image-generation path so the web app can generate images through a self-hosted GPU backend without exposing the ComfyUI address or API credentials to the browser.

## Architecture

```text
Browser
  -> https://ai.tatpc.ca
  -> Nginx on Hostinger VPS
  -> Next.js container on 127.0.0.1:3001
  -> /api/local-image
  -> private ComfyUI endpoint
  -> GPU / SDXL checkpoint
```

The original cloud-powered features remain in the repository. The new self-hosted image page is available at:

```text
https://ai.tatpc.ca/local-image
```

## 1. DNS in Hostinger

Create an A record for the subdomain:

```text
Type: A
Name/Host: ai
Points to: YOUR_HOSTINGER_VPS_IPV4
TTL: default
```

Do not replace the root `tatpc.ca` A record unless you intentionally want to move the main site.

## 2. VPS prerequisites

Ubuntu 22.04/24.04 is recommended.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx certbot python3-certbot-nginx ca-certificates curl
```

Install Docker Engine + Docker Compose using Docker's current Ubuntu instructions, then verify:

```bash
docker --version
docker compose version
```

## 3. Clone the repository

```bash
sudo mkdir -p /var/www
cd /var/www
sudo git clone https://github.com/thecipherxpro/Open-Generative-AI.git
cd Open-Generative-AI
git checkout main
```

For a public repository no GitHub token is required to clone.

## 4. Configure environment variables

```bash
cp .env.example .env
nano .env
```

Minimum values:

```env
NEXT_PUBLIC_APP_URL=https://ai.tatpc.ca
COMFYUI_URL=http://host.docker.internal:8188
COMFYUI_CHECKPOINT=sd_xl_base_1.0.safetensors
COMFYUI_OUTPUT_PREFIX=tatpc-ai
LOCAL_AI_TIMEOUT_MS=240000
LOCAL_AI_RATE_LIMIT=10
```

If ComfyUI runs on another machine, use its PRIVATE or VPN address instead, for example:

```env
COMFYUI_URL=http://10.10.10.25:8188
```

Never add `NEXT_PUBLIC_` to `COMFYUI_URL` or provider secrets. Anything prefixed `NEXT_PUBLIC_` can be sent to the browser by Next.js.

## 5. Start the web application

```bash
docker compose up -d --build
```

Check it locally on the VPS:

```bash
curl -I http://127.0.0.1:3001
curl http://127.0.0.1:3001/api/local-image/health
```

The app container is bound only to loopback, so port 3001 is not exposed publicly.

## 6. Configure Nginx

```bash
sudo cp deploy/nginx/ai.tatpc.ca.conf /etc/nginx/sites-available/ai.tatpc.ca
sudo ln -s /etc/nginx/sites-available/ai.tatpc.ca /etc/nginx/sites-enabled/ai.tatpc.ca
sudo nginx -t
sudo systemctl reload nginx
```

If the default Nginx site conflicts, disable it:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

## 7. Enable HTTPS

After `ai.tatpc.ca` resolves to the VPS:

```bash
sudo certbot --nginx -d ai.tatpc.ca
```

Then test:

```bash
curl -I https://ai.tatpc.ca
curl https://ai.tatpc.ca/api/local-image/health
```

## 8. ComfyUI backend

A normal CPU-only Hostinger VPS is suitable for the Next.js website but is generally not a practical SDXL inference server. For useful generation speeds, run ComfyUI on a GPU machine.

The backend must have the checkpoint configured by `COMFYUI_CHECKPOINT` in ComfyUI's checkpoint directory. The default expected name is:

```text
sd_xl_base_1.0.safetensors
```

If your checkpoint is named differently, update `.env` and restart:

```bash
docker compose up -d
```

### Recommended network layout

Do not expose ComfyUI port `8188` directly to the public internet. Prefer one of these:

1. ComfyUI on the same GPU-capable VPS/server and bind it privately.
2. ComfyUI on a separate GPU machine connected through Tailscale/WireGuard/private networking.
3. A firewall rule that allows port 8188 only from the Hostinger VPS IP.

The public browser should only access `https://ai.tatpc.ca`; Next.js proxies generated images through `/api/local-image/image`.

## 9. Firewall

If UFW is enabled on the Hostinger VPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

Do not open port 3001 publicly.

## 10. Updating the deployment

```bash
cd /var/www/Open-Generative-AI
git pull
docker compose up -d --build
```

## 11. Test local generation

Open:

```text
https://ai.tatpc.ca/local-image
```

The top-right status must show the local AI as online. Enter a prompt and click **Generate locally**.

If it shows offline:

```bash
curl http://127.0.0.1:3001/api/local-image/health
docker compose logs -f open-generative-ai
```

Then test the ComfyUI endpoint from the VPS host:

```bash
curl http://YOUR_COMFYUI_HOST:8188/system_stats
```

## Cost note

The self-hosted path does not charge a per-image API fee. It still consumes the GPU server's compute, electricity, bandwidth, and storage. Cloud features from the upstream application can still require their own API keys/credits.
