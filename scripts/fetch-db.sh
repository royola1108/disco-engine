#!/bin/bash
# Download disco.db from the community source.
# Run this on the VPS after git clone, before docker compose up.
set -e

DATA_DIR="$(dirname "$0")/data"
mkdir -p "$DATA_DIR"

if [ -f "$DATA_DIR/disco.db" ]; then
    echo "disco.db already exists ($(du -h "$DATA_DIR/disco.db" | cut -f1)), skipping."
    exit 0
fi

echo "Downloading disco.db from github.com/msyavuz/disco-api ..."
curl -fSL -o "$DATA_DIR/disco.db" \
    "https://raw.githubusercontent.com/msyavuz/disco-api/main/disco.db"

echo "Done. $(du -h "$DATA_DIR/disco.db" | cut -f1)"
