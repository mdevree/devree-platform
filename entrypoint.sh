#!/bin/sh
set -e

echo "Running Prisma db push..."
npx prisma db push --skip-generate

echo "Starting server..."
exec node server.js
