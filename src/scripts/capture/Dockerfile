FROM node:20-alpine

WORKDIR /app

# Optional utilities used by some collectors.
RUN apk add --no-cache smartmontools sysstat

COPY package.json ./
RUN npm install --omit=dev

COPY linux.js ./

ENV PULSE_INTERVAL_MS=300000
CMD ["node", "linux.js"]
