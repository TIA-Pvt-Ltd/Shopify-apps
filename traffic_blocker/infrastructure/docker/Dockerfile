FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/storefront/package.json apps/storefront/package.json
COPY packages packages
COPY extensions/traffic-pixel/package.json extensions/traffic-pixel/package.json
RUN npm install --omit=dev=false
COPY . .
RUN npm run build -w @traffic-blocker/admin || true
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@traffic-blocker/backend"]
