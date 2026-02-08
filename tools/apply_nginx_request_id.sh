#!/usr/bin/env bash
set -euo pipefail

SOURCE_CONF="/home/ali/geovito-stack/tools/cms.geovito.com.request-id.conf"
TARGET_CONF="/etc/nginx/sites-available/cms.geovito.com"

sudo cp "$TARGET_CONF" "${TARGET_CONF}.bak.$(date +%F-%H%M%S)"
sudo cp "$SOURCE_CONF" "$TARGET_CONF"
sudo nginx -t
sudo systemctl reload nginx

echo "Nginx request-id config applied and reloaded."
