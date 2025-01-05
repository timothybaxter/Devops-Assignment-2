import { MongoClient } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'watchlists-db';

let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) return cachedDb;
    const client = await MongoClient.connect(MONGODB_URI);
    cachedDb = client.db(DB_NAME);
    return cachedDb;
}

export const handler = async (event) => {
    try {
        const db = await connectToDatabase();
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: 'Connected to watchlists-db successfully'
            })
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Database connection failed',
                error: error.message
            })
        };
    }
};