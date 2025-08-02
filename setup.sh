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

mkdir -p logs
chmod -R 777 logs

echo "Creating initial self-signed certificates for domain $DOMAIN"
mkdir -p nginx/certs
openssl req -x509 -nodes -newkey rsa:4096 -days 1 \
    -keyout nginx/certs/privkey.pem \
    -out nginx/certs/fullchain.pem \
    -subj "/CN=$DOMAIN/O=Discord Bot/C=US"

echo "Setup completed. Next steps:"
echo "1. Make sure your domain $DOMAIN points to your server's IP address"
echo "2. Edit your .env file with proper configuration"
echo "3. Start the bot and web dashboard using Node.js:"
echo "   npm install"
echo "   npm start"
echo "4. Request Let's Encrypt SSL certificates manually if needed."
echo "5. Place certificates in nginx/certs directory."
echo "6. Reload Nginx if you update certificates."