#!/bin/bash

# Check for domain argument
if [ -z "$1" ]; then
    echo "Usage: $0 yourdomain.com"
    echo "Please provide your domain name as an argument"
    exit 1
fi

DOMAIN=$1

# Create necessary directories
mkdir -p nginx/certs

# Generate a private key
openssl genrsa -out nginx/certs/privkey.pem 2048

# Generate a CSR (Certificate Signing Request)
openssl req -new -key nginx/certs/privkey.pem -out nginx/certs/cert.csr \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN"

# Generate the self-signed certificate
openssl x509 -req -days 365 -in nginx/certs/cert.csr \
    -signkey nginx/certs/privkey.pem -out nginx/certs/fullchain.pem

# Clean up the CSR file
rm nginx/certs/cert.csr

echo "Self-signed SSL certificate created for $DOMAIN"
echo "Certificate location: nginx/certs/fullchain.pem"
echo "Private key location: nginx/certs/privkey.pem"