#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
  data_directory="${ARCPROOF_DATA_DIR:-/data}"
  mkdir -p "$data_directory"
  chown -R nextjs:nodejs "$data_directory"
  exec su-exec nextjs:nodejs "$@"
fi

exec "$@"
