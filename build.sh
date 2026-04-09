#!/bin/bash
set -e

# Establish upload directory natively on persistent disk
mkdir -p /opt/render/project/data/uploads

# Destroy ephemeral upload directory if it exists and symlink cleanly
rm -rf public/uploads
mkdir -p public
ln -s /opt/render/project/data/uploads public/uploads

# Install and build correctly
npm install
npx prisma generate
npx prisma db push --accept-data-loss
npm run build
