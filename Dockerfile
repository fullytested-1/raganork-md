FROM node:22-alpine

RUN apk add --no-cache \
    git \
    ffmpeg \
    libwebp-tools \
    python3 \
    make \
    g++

WORKDIR /app

COPY package.json ./
COPY yarn.lock ./

RUN npm install -g pm2
RUN yarn install

COPY . .

RUN mkdir -p temp

ENV TZ=Asia/Kolkata

CMD ["node", "index.js"]
