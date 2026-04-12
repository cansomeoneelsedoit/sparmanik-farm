#!/bin/sh
echo "Configuring nginx to listen on port $PORT"
cat > /etc/nginx/conf.d/default.conf << CONF
server {
    listen $PORT;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files \$uri \$uri/ /index.html;
    }
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
}
CONF
echo "Nginx config written. Starting nginx..."
cat /etc/nginx/conf.d/default.conf
exec nginx -g "daemon off;"
