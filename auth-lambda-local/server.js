import express from "express";
const { handler } = require("./index.mjs");

const app = express();
app.use(express.json());

app.post("/auth/*", async (req, res) => {
  const result = await handler({
    body: JSON.stringify(req.body)
  });
  res.status(result.statusCode).json(JSON.parse(result.body));
});

app.options("/auth/*", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.sendStatus(200);
});

const port = 3001;
app.listen(port, () => {
  console.log(`Auth service listening on port ${port}`);
});

