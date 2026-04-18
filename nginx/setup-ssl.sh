#!/bin/bash
# Generate self-signed SSL certificate for development
# In production, use Let's Encrypt or your own CA

mkdir -p /etc/nginx/ssl

openssl req -x509 -nodes -days 365 -newkey rsa:2048     -keyout /etc/nginx/ssl/key.pem     -out /etc/nginx/ssl/cert.pem     -subj "/C=US/ST=State/L=City/O=SportsAnalytics/CN=localhost"

echo "Self-signed SSL certificate generated"
echo "For production, replace with certificates from a trusted CA"
