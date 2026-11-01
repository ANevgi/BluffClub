FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && chown -R node:node .next
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
USER node
CMD ["npm","start"]
