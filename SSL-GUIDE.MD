# Setting Up SSL for Your Discord Bot with Nginx

This guide will walk you through setting up SSL for your Discord bot with Nginx as a reverse proxy. There are two main approaches:

1. Using Let's Encrypt for free, trusted SSL certificates (recommended for production)
2. Using self-signed certificates (for testing/development only)

## Prerequisites

- A domain name pointing to your server's IP address
Node.js and Nginx installed
- Port 80 and 443 open on your server's firewall

## Option 1: Setting Up with Let's Encrypt (Recommended)

Let's Encrypt provides free, trusted SSL certificates that are recognized by all modern browsers.

### Step 1: Run the SSL Setup Script

```bash
chmod +x ssl-setup.sh
./ssl-setup.sh yourdomain.com your@email.com
```

This script will:
- Create the necessary directory structure
- Generate Nginx configuration with SSL support
- Create a temporary self-signed certificate

### Step 2: Start the Bot and Web Dashboard

```bash
npm install
npm start
```

This will start the Discord bot and web dashboard. Make sure MongoDB and Nginx are running.

### Step 3: Obtain Let's Encrypt Certificate

Use Certbot manually to obtain your certificate:
```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  --email your@email.com -d yourdomain.com -d www.yourdomain.com \
  --agree-tos --force-renewal
```

### Step 4: Copy the Certificates to Nginx

```bash
sudo cp -L /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/certs/fullchain.pem
sudo cp -L /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/certs/privkey.pem
```

### Step 5: Reload Nginx

```bash
sudo systemctl reload nginx
```

Your Discord bot should now be accessible via HTTPS. Set up automatic certificate renewal with Certbot as needed.

## Option 2: Setting Up with Self-Signed Certificates (Development Only)

Self-signed certificates are useful for development and testing but will show security warnings in browsers.

### Step 1: Generate Self-Signed Certificate

```bash
chmod +x generate-self-signed-ssl.sh
./generate-self-signed-ssl.sh yourdomain.com
```

### Step 2: Update Nginx Configuration

Create or update nginx/nginx-ssl.conf:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    
    # SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    
    # Proxy settings
    location / {
        proxy_pass http://discord-bot:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Step 3: Update Docker Compose File

Update docker-compose.yml to include the certificates:

```yaml
services:
  nginx:
    # ... existing configuration ...
    volumes:
      - ./nginx/nginx-ssl.conf:/etc/nginx/conf.d/default.conf
      - ./nginx/certs:/etc/nginx/certs
      - ./nginx/logs:/var/log/nginx
    ports:
      - "80:80"
      - "443:443"
```

### Step 4: Update .env File

Update your .env file to use HTTPS:

```
DASHBOARD_URL=https://yourdomain.com
CALLBACK_URL=https://yourdomain.com/auth/discord/callback
```

### Step 5: Start the Containers

```bash
docker-compose up -d
```

## Troubleshooting SSL Setup

### Certificate Issues

If you're having issues with the Let's Encrypt certificate:

1. Check that your domain points to your server:
   ```bash
   dig yourdomain.com
   ```

2. Verify the Certbot logs:
   ```bash
   docker-compose logs certbot
   ```

3. Make sure ports 80 and 443 are open:
   ```bash
   sudo ufw status
   ```

### Nginx Configuration

If Nginx is not serving the site correctly:

1. Check the Nginx logs:
   ```bash
   docker-compose logs nginx
   ```

2. Verify the certificate path:
   ```bash
   docker-compose exec nginx ls -la /etc/nginx/certs
   ```

3. Test the Nginx configuration:
   ```bash
   docker-compose exec nginx nginx -t
   ```

## Security Best Practices

1. **Keep certificates private**: Never share your private key
2. **Enable HSTS**: Already included in the config to enforce HTTPS
3. **Use strong cipher suites**: Already configured in the Nginx configuration
4. **Disable older TLS versions**: Only TLSv1.2 and TLSv1.3 are enabled

## Certificate Renewal

With the Let's Encrypt setup, certificates will be renewed automatically. 
The certbot container is configured to check for renewal every 12 hours and copy the renewed certificates to Nginx.