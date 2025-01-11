# Dockerfile for watchlist-lambda-local
FROM node:18-alpine

WORKDIR /usr/src/app

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
app.post("/watchlist/*", async (req, res) => {\n\
  const result = await handler({\n\
    body: JSON.stringify(req.body)\n\
  });\n\
  res.status(result.statusCode).json(JSON.parse(result.body));\n\
});\n\
\n\
const port = 3003;\n\
app.listen(port, () => {\n\
  console.log(`Watchlist service listening on port ${port}`);\n\
});' > server.js

EXPOSE 3003

CMD ["node", "server.js"]