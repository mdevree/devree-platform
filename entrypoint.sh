#!/bin/sh
node node_modules/prisma/build/index.js migrate deploy
exec node server.js
