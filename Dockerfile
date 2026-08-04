# Portable image for any container host (Railway, Fly.io, a VPS).
# Render users don't need this — render.yaml uses the native Node runtime.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
# SQLite data lives on a mounted volume; point DATA_DIR at it (e.g. /data).
EXPOSE 3000
CMD ["node", "server.js"]
