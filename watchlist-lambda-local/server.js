import express from "express";
const { handler } = require("./index.mjs");

const app = express();
app.use(express.json());

// Handle GET requests for watchlist
app.get("/watchlist", async (req, res) => {
  const result = await handler({
    httpMethod: 'GET',
    queryStringParameters: req.query
  });
  res.status(result.statusCode).json(JSON.parse(result.body));
});

// Handle POST requests for watchlist operations
app.post("/watchlist/*", async (req, res) => {
  const result = await handler({
    httpMethod: 'POST',
    body: JSON.stringify(req.body)
  });
  res.status(result.statusCode).json(JSON.parse(result.body));
});

app.options("/watchlist/*", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.sendStatus(200);
});

const port = 3003;
app.listen(port, () => {
  console.log(`Watchlist service listening on port ${port}`);
});

