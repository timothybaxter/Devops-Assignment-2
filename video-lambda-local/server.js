const express = require("express");
const { handler } = require("./index.mjs");

const app = express();
app.use(express.json());

// Handle GET requests for video listing
app.get("/videos", async (req, res) => {
  const result = await handler({
    httpMethod: 'GET'
  });
  res.status(result.statusCode).json(JSON.parse(result.body));
});

// Handle POST requests for video operations
app.post("/videos/*", async (req, res) => {
  const result = await handler({
    httpMethod: 'POST',
    body: JSON.stringify(req.body)
  });
  res.status(result.statusCode).json(JSON.parse(result.body));
});

app.options("/videos/*", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.sendStatus(200);
});

const port = 3002;
app.listen(port, () => {
  console.log(`Video service listening on port ${port}`);
});

