import { MongoClient, ObjectId } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'videos-db';
let cachedDb = null;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json'
};

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const client = await MongoClient.connect(MONGODB_URI);
  cachedDb = client.db(DB_NAME);
  return cachedDb;
}

export const handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'OK' })
    };
  }

  try {
    const db = await connectToDatabase();
    const watchlistsCollection = db.collection('watchlists');

    // GET request - retrieve watchlist
    if (event.httpMethod === 'GET') {
      const userId = event.queryStringParameters?.userId;
      if (!userId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing userId parameter' })
        };
      }

      const watchlist = await watchlistsCollection.findOne({ userId });
      if (!watchlist) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ videos: [] })
        };
      }

      // Fetch video details for watchlist
      const videos = await db.collection('videos')
        .find({ _id: { $in: watchlist.videos.map(id => new ObjectId(id)) } })
        .toArray();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(videos)
      };
    }

    // POST request - add to watchlist
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { userId, videoId } = body;

      if (!userId || !videoId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing required fields' })
        };
      }

      await watchlistsCollection.updateOne(
        { userId },
        {
          $addToSet: { videos: videoId },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Watchlist updated successfully' })
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid request method' })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};