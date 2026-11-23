#!/usr/bin/with-contenv bashio
bashio::log.info "Starting EnergyPlus dashboard..."
exec node /app/server.mjs
