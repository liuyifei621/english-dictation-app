FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --prod --frozen-lockfile --allow-build=tesseract.js
COPY index.js ./
RUN mkdir -p /app/tmp
ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787
CMD ["node", "index.js"]
