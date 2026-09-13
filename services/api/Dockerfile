FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/mobile/package.json ./apps/mobile/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/visual-engine/package.json ./packages/visual-engine/package.json
COPY services/api/package.json ./services/api/package.json
RUN npm ci --omit=dev --workspace @lazy-bank/api --include-workspace-root=false
COPY services/api/src ./services/api/src
USER node
EXPOSE 3001
CMD ["node", "services/api/src/index.js"]
