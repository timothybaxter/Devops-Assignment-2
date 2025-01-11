FROM node:18-alpine
WORKDIR /usr/src/app
# Install ffmpeg
RUN apk add --no-cache ffmpeg
COPY package*.json ./
RUN npm install
RUN npm install express
COPY . .
EXPOSE 3002
CMD ["node", "server.js"]