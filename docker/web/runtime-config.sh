#!/bin/sh
set -eu

API_BASE_URL="${APP_API_BASE_URL:-/api/v1}"
ESCAPED_API_BASE_URL=$(printf '%s' "$API_BASE_URL" | sed 's/\\/\\\\/g; s/"/\\"/g')

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__OPENCASHIER_RUNTIME_CONFIG__ = Object.assign(
  {},
  window.__OPENCASHIER_RUNTIME_CONFIG__ || {},
  {
    API_BASE_URL: "${ESCAPED_API_BASE_URL}"
  }
);
EOF
