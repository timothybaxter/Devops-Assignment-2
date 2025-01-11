import express from 'express';
import { handler } from './index.mjs';

const app = express();
app.use(express.json());

app.get("/videos", async (req, res) => {
  const result = await handler({
    httpMethod: 'GET'
  });
  res.status(result.statusCode).json(JSON.parse(result.body));
});

app.post("/videos/*", async (req, res) => {
  const result = await handler({
    httpMethod: 'POST',
    body: JSON.stringify(req.body)
  });
  res.status(result.statusCode).json(JSON.parse(result.body));
});

const port = 3002;
app.listen(port, () => {
  console.log(`Video service listening on port ${port}`);
});