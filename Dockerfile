FROM node:18-alpine AS build

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD sh -c "sed -i 's/listen 80/listen '\"$PORT\"'/' /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"
