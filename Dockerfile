FROM node:24-alpine

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./
RUN npm ci --omit=dev

COPY favicon.svg ./
COPY index.html ./
COPY robots.txt ./
COPY styles.css ./
COPY scripts ./scripts
COPY src ./src

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
