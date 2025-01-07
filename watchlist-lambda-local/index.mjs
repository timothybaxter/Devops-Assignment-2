const { MongoClient, ObjectId } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'videos-db';
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const client = await MongoClient.connect(MONGODB_URI);
  cachedDb = client.db(DB_NAME);
  return cachedDb;
}

exports.handler = async (event) => {
  try {
    const db = await connectToDatabase();
    const watchlistsCollection = db.collection('watchlists');
    const body = JSON.parse(event.body || '{}');
    
    const response = {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      }
    };

    if (event.httpMethod === 'GET') {
      const watchlist = await watchlistsCollection.findOne({ userId: body.userId });
      const videos = watchlist ? await db.collection('videos')
        .find({ _id: { $in: (watchlist.videos || []).map(id => new ObjectId(id)) }})
        .toArray() : [];
      
      return {
        ...response,
        statusCode: 200,
        body: JSON.stringify({ videos })
      };
    }

    if (event.httpMethod === 'POST') {
      await watchlistsCollection.updateOne(
        { userId: body.userId },
        { 
          $addToSet: { videos: body.videoId },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );
      
      return {
        ...response,
        statusCode: 200,
        body: JSON.stringify({ message: 'Watchlist updated successfully' })
      };
    }

    return {
      ...response,
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid method' })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: error.message })
    };
  }
}