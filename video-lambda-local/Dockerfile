# Dockerfile for video-lambda-local
FROM node:18-alpine

WORKDIR /usr/src/app

# Install ffmpeg for video processing
RUN apk add --no-cache ffmpeg

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create a server script
RUN echo '#!/usr/bin/env node\n\
const express = require("express");\n\
const { handler } = require("./index.mjs");\n\
\n\
const app = express();\n\
app.use(express.json());\n\
\n\
app.post("/videos/*", async (req, res) => {\n\
  const result = await handler({\n\
    body: JSON.stringify(req.body)\n\
  });\n\
  res.status(result.statusCode).json(JSON.parse(result.body));\n\
});\n\
\n\
const port = 3002;\n\
app.listen(port, () => {\n\
  console.log(`Video service listening on port ${port}`);\n\
});' > server.js

EXPOSE 3002

CMD ["node", "server.js"]