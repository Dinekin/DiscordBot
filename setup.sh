#!/bin/bash

# Check for domain argument
if [ -z "$1" ]; then
    echo "Usage: $0 yourdomain.com"
    echo "Please provide your domain name as an argument"
    exit 1
fi

DOMAIN=$1
EMAIL=${2:-"admin@$DOMAIN"}  # Use provided email or default to admin@domain.com

echo "Setting up SSL for domain: $DOMAIN"
echo "Using email: $EMAIL"

# Create necessary directories
mkdir -p nginx/logs
mkdir -p nginx/certs
mkdir -p certbot/www
mkdir -p certbot/conf

# Create nginx configuration for SSL
mkdir -p nginx
cat > nginx/nginx-ssl.conf << EOL
# HTTP server - redirects to HTTPS
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    # Redirect all HTTP requests to HTTPS
    location / {
        return 301 https://\$host\$request_uri;
    }
    
    # For Let's Encrypt certificate renewal
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;
    
    # SSL Certificate Configuration
    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    
    # SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers "EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH";
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    
    # HSTS (comment out if you don't need it)
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";
    
    # Proxy settings
    location / {
        proxy_pass http://discord-bot:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Gzip settings
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 1000;
    gzip_comp_level 6;
}
EOL

# Update docker-compose.yml for SSL
cat > docker-compose.yml << EOL
version: '3.8'

services:
  # Nginx reverse proxy
  nginx:
    image: nginx:alpine
    container_name: discord-bot-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"  # For HTTPS
    volumes:
      - ./nginx/nginx-ssl.conf:/etc/nginx/conf.d/default.conf
      - ./nginx/certs:/etc/nginx/certs
      - ./nginx/logs:/var/log/nginx
      - ./certbot/www:/var/www/certbot
    depends_on:
      - discord-bot
    networks:
      - bot-network

  # Certbot for SSL certificate management
  certbot:
    image: certbot/certbot:latest
    container_name: discord-bot-certbot
    volumes:
      - ./certbot/www:/var/www/certbot
      - ./certbot/conf:/etc/letsencrypt
      - ./nginx/certs:/certs
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; cp -L /etc/letsencrypt/live/$DOMAIN/fullchain.pem /certs/fullchain.pem; cp -L /etc/letsencrypt/live/$DOMAIN/privkey.pem /certs/privkey.pem; sleep 12h & wait \$\${!}; done;'"
    depends_on:
      - nginx
    networks:
      - bot-network

  # Discord Bot with Web Dashboard
  discord-bot:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: discord-reaction-bot
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./logs:/usr/src/app/logs
    expose:
      - "3000"  # Expose to internal network, not to host
    depends_on:
      - mongodb
    networks:
      - bot-network

  # MongoDB Database
  mongodb:
    image: mongo:5
    container_name: discord-bot-mongodb
    restart: unless-stopped
    environment:
      - MONGO_INITDB_ROOT_USERNAME=\${MONGO_INITDB_ROOT_USERNAME:-admin}
      - MONGO_INITDB_ROOT_PASSWORD=\${MONGO_INITDB_ROOT_PASSWORD:-password}
    volumes:
      - mongodb-data:/data/db
    expose:
      - "27017"  # Expose to internal network, not to host
    networks:
      - bot-network

volumes:
  mongodb-data:
    name: discord-bot-mongodb-data

networks:
  bot-network:
    name: discord-bot-network
    driver: bridge
EOL

# Check if .env exists, if not create from example
if [ ! -f .env ]; then
    if [ -f .env_example ]; then
        cp .env_example .env
        echo "Created .env file from .env_example"
        echo "Please edit .env file with your configuration before starting the containers"
    else
        echo "Warning: No .env_example file found to create .env"
        echo "Please create .env file manually before starting the containers"
    fi

    # Update .env file with HTTPS settings
    echo "Updating .env file with HTTPS settings"
    sed -i "s|DASHBOARD_URL=http://localhost|DASHBOARD_URL=https://$DOMAIN|g" .env
    sed -i "s|CALLBACK_URL=http://localhost/auth/discord/callback|CALLBACK_URL=https://$DOMAIN/auth/discord/callback|g" .env
fi

# Make logs directory if it doesn't exist
mkdir -p logs
chmod -R 777 logs

# Initial certificates
echo "Creating initial self-signed certificates for domain $DOMAIN"
mkdir -p nginx/certs
openssl req -x509 -nodes -newkey rsa:4096 -days 1 \
    -keyout nginx/certs/privkey.pem \
    -out nginx/certs/fullchain.pem \
    -subj "/CN=$DOMAIN/O=Discord Bot/C=US"

echo "Setup completed. Next steps:"
echo "1. Make sure your domain $DOMAIN points to your server's IP address"
echo "2. Edit your .env file with proper configuration"
echo "3. Start containers with the initial self-signed certificate:"
echo "   docker-compose up -d"
echo "4. Request Let's Encrypt SSL certificates:"
echo "   docker-compose exec certbot certbot certonly --webroot -w /var/www/certbot \\"
echo "     --email $EMAIL -d $DOMAIN -d www.$DOMAIN \\"
echo "     --agree-tos --force-renewal"
echo "5. Copy certificates to the nginx/certs directory:"
echo "   docker-compose exec certbot cp -L /etc/letsencrypt/live/$DOMAIN/fullchain.pem /certs/fullchain.pem"
echo "   docker-compose exec certbot cp -L /etc/letsencrypt/live/$DOMAIN/privkey.pem /certs/privkey.pem"
echo "6. Reload Nginx:"
echo "   docker-compose exec nginx nginx -s reload"
echo ""
echo "Note: Certificate renewal will happen automatically every 12 hours"