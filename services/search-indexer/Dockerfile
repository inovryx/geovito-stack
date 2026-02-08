FROM node:20-alpine

WORKDIR /opt/search-indexer

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
ENV PORT=4400

EXPOSE 4400

CMD ["npm", "start"]
