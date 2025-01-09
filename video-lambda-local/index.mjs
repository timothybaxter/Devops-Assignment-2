import { MongoClient } from 'mongodb';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'videos-db';
const s3Client = new S3Client({ region: 'us-east-1' });
console.log('Testing automatic deployment via webhook - 5' + new Date().toISOString());


let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const client = await MongoClient.connect(MONGODB_URI);
  cachedDb = client.db(DB_NAME);
  return cachedDb;
}

async function processS3Event(record) {
  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
  const size = record.s3.object.size;
  const eventName = record.eventName;

  // Only process video uploads
  if (!key.startsWith('videos/') || !key.toLowerCase().endsWith('.mp4')) {
    console.log('Skipping non-video file:', key);
    return null;
  }

  // Handle deletion events
  if (eventName.startsWith('ObjectRemoved:')) {
    const db = await connectToDatabase();
    await db.collection('videos').deleteOne({ key: key });
    console.log('Deleted video metadata for:', key);
    return;
  }

  // Get video metadata from S3
  try {
    const headObjectCommand = new HeadObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    const s3Object = await s3Client.send(headObjectCommand);
    
    const videoMetadata = {
      key: key,
      filename: key.split('/').pop(),
      size: size,
      contentType: s3Object.ContentType,
      lastModified: s3Object.LastModified,
      uploadDate: new Date(),
      url: `https://${bucket}.s3.amazonaws.com/${key}`,
      status: 'active'
    };

    // Store in MongoDB
    const db = await connectToDatabase();
    await db.collection('videos').updateOne(
      { key: key },
      { $set: videoMetadata },
      { upsert: true }
    );

    console.log('Successfully processed video:', key);
    return videoMetadata;
  } catch (error) {
    console.error('Error processing video:', key, error);
    throw error;
  }
}

export const handler = async (event) => {
  console.log('Raw event:', JSON.stringify(event, null, 2));

  try {
    const results = await Promise.all(
      event.Records.map(record => processS3Event(record))
    );

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        message: 'Processed S3 events successfully',
        results: results.filter(r => r !== null)
      })
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        error: 'Failed to process S3 events',
        details: error.message
      })
    };
  }
};