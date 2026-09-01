ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache nodejs ca-certificates
WORKDIR /opt/youtube-sender
COPY package.json ./
COPY server ./server
COPY public ./public
COPY rootfs /
RUN chmod +x /etc/services.d/youtube-sender/run

ENV PORT=8099 DATA_DIR=/data NODE_ENV=production
EXPOSE 8099

LABEL io.hass.version="0.1.1" io.hass.type="app"
