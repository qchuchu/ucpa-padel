FROM node:22-slim

WORKDIR /app

# install deps first (better layer caching); official glibc image resolves the
# correct linux-x64-gnu native bindings (rolldown, lightningcss)
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start"]
