import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'videos-db';
console.log('Testing automatic deployment via webhook - ' + new Date().toISOString());


let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const client = await MongoClient.connect(MONGODB_URI);
  cachedDb = client.db(DB_NAME);
  return cachedDb;
}

export const handler = async (event) => {
  console.log('Raw event:', JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || '{}'); // Parse the body safely
    console.log('Parsed body:', body);

    const { userId, videoId } = body;

    if (!userId || !videoId) {
      console.error('Validation error: Missing userId or videoId');
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required fields: userId or videoId' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Success', userId, videoId }),
    };
  } catch (err) {
    console.error('Error processing event:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error', details: err.message }),
    };
  }
};
