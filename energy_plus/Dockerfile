ARG BUILD_FROM
FROM ${BUILD_FROM}

# Node.js 22 has a built-in WebSocket client and fetch, so no npm packages are needed.
RUN apk add --no-cache nodejs

COPY rootfs /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
