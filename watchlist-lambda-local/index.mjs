import { MongoClient, ObjectId } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'watchlist-db'; 
let cachedDb = null;

console.log("Demo")
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
          body: JSON.stringify([])
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(watchlist.videos || [])
      };
    }

    // POST request - add/remove from watchlist
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      const { userId, videoId, action } = body;

      if (!userId || !videoId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing required fields' })
        };
      }

      if (action === 'remove') {
        await watchlistsCollection.updateOne(
          { userId },
          {
            $pull: { videos: videoId }
          }
        );
      } else {
        await watchlistsCollection.updateOne(
          { userId },
          {
            $addToSet: { videos: videoId },
            $setOnInsert: { createdAt: new Date() }
          },
          { upsert: true }
        );
      }

      // Get updated watchlist
      const updatedWatchlist = await watchlistsCollection.findOne({ userId });
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(updatedWatchlist?.videos || [])
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