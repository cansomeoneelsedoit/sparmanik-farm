#!/bin/sh
echo "Configuring nginx on port $PORT"
cat > /etc/nginx/conf.d/default.conf << 'CONF'
server {
    listen PORTPLACEHOLDER;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml image/svg+xml;
}
CONF
sed -i "s/PORTPLACEHOLDER/$PORT/" /etc/nginx/conf.d/default.conf
echo "Final nginx config:"
cat /etc/nginx/conf.d/default.conf
exec nginx -g "daemon off;"
