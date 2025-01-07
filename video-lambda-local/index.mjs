import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MongoClient, ObjectId } from 'mongodb';

// Initialize S3 client with hardcoded region
const s3Client = new S3Client({
  region: 'us-east-1',
  forcePathStyle: true
});

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'videos-db';

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) {
    return cachedDb;
  }

  const client = await MongoClient.connect(MONGODB_URI);
  cachedDb = client.db(DB_NAME);
  return cachedDb;
}

export const handler = async (event) => {
  try {
    console.log('Event received:', JSON.stringify(event, null, 2));

    const db = await connectToDatabase();
    const videosCollection = db.collection('videos');

    if (event.Records) {
      return await handleS3Event(event, videosCollection);
    } else if (event.httpMethod) {
      return await handleAPIRequest(event, videosCollection);
    }

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};

async function handleS3Event(event, collection) {
  for (const record of event.Records) {
    if (!record.eventName.startsWith('ObjectCreated:')) continue;

    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    console.log('Processing new video:', { bucket, key });

    try {
      // Get S3 object metadata
      const headCommand = new HeadObjectCommand({
        Bucket: bucket,
        Key: key
      });

      console.log('Getting object metadata...');
      const s3Object = await s3Client.send(headCommand);

      // Create GetObject command for signed URL
      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: key
      });

      console.log('Generating signed URL...');
      const url = await getSignedUrl(s3Client, getCommand, { 
        expiresIn: 86400,
        signableHeaders: new Set(['host'])
      });

      // Prepare metadata document
      const metadata = {
        fileName: key.split('/').pop(),
        s3Key: key,
        s3Bucket: bucket,
        uploadDate: new Date(),
        contentType: s3Object.ContentType,
        size: s3Object.ContentLength,
        url: url,
        status: 'ready'  // Set as ready since we're skipping duration
      };

      console.log('Created metadata:', metadata);
      console.log('Saving to MongoDB...');
      await collection.insertOne(metadata);
      console.log('Metadata saved to MongoDB');

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Metadata processing completed successfully' })
      };

    } catch (error) {
      console.error('Error processing video:', error);
      throw error;
    }
  }
}