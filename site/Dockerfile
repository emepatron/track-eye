# Landing page do Track Eye. Contexto de build: raiz do repositório.
# Coolify: build pack Dockerfile, Base Directory "/", Dockerfile Location "/site/Dockerfile".
FROM nginx:alpine
COPY site/nginx.conf /etc/nginx/conf.d/default.conf
COPY site/index.html /usr/share/nginx/html/index.html
COPY site/og.png /usr/share/nginx/html/og.png
COPY assets/ /usr/share/nginx/html/assets/
RUN nginx -t
EXPOSE 80
