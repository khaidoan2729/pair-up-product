FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
ENV NODE_ENV=production PORT=3000 STORAGE_MODE=sqlite DATA_DIR=/data
EXPOSE 3000
CMD ["node", "--experimental-sqlite", "src/server.js"]
