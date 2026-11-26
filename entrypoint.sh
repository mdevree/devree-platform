#!/bin/sh
set -e
./node_modules/.bin/prisma migrate deploy
export LISTING_SEARCH_WORKER=1
exec node server.js
