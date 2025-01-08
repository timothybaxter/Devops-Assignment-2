import { MongoClient, ObjectId } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'videos-db';
let cachedDb = null;
console.log('Testing automatic deployment via webhook - ' + new Date().toISOString());


async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const client = await MongoClient.connect(MONGODB_URI);
  cachedDb = client.db(DB_NAME);
  return cachedDb;
}

export const handler = async (event) => {
    console.log('Raw event body:', event.body);

    try {
        // Ensure body is parsed correctly
        const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
        console.log('Parsed body:', body);

        // Extract required fields
        const userId = body?.userId;
        const videoId = body?.videoId;

        if (!userId || !videoId) {
            throw new Error('Missing required fields: userId or videoId');
        }

        const db = await connectToDatabase();
        const watchlistsCollection = db.collection('watchlists');

        await watchlistsCollection.updateOne(
            { userId: userId },
            {
                $addToSet: { videos: videoId },
                $setOnInsert: { createdAt: new Date() },
            },
            { upsert: true }
        );

        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: 'Watchlist updated successfully' }),
        };
    } catch (error) {
        console.error('Error:', error.message);

        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ error: error.message }),
        };
    }
};
