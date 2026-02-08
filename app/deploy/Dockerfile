FROM node:20-alpine

WORKDIR /opt/app

RUN apk add --no-cache curl

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production

EXPOSE 1337

CMD ["npm", "run", "start"]
