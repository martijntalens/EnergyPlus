#!/usr/bin/with-contenv bashio
bashio::log.info "Starting Energie+ dashboard..."
exec node /app/server.mjs
