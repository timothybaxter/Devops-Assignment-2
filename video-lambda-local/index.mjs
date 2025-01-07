const AWS = require('aws-sdk');
const { MongoClient, ObjectId } = require('mongodb');
const { getVideoDurationInSeconds } = require('get-video-duration');

const s3 = new AWS.S3();
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

exports.handler = async (event) => {
  try {
    const db = await connectToDatabase();
    const videosCollection = db.collection('videos');

    // Handle different event types
    if (event.Records) {
      // S3 event trigger
      return await handleS3Event(event, videosCollection);
    } else if (event.httpMethod) {
      // API Gateway event
      return await handleAPIRequest(event, videosCollection);
    }

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

async function handleS3Event(event, collection) {
  for (const record of event.Records) {
    if (!record.eventName.startsWith('ObjectCreated:')) continue;

    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    // Get S3 object metadata
    const s3Object = await s3.headObject({
      Bucket: bucket,
      Key: key
    }).promise();

    // Generate signed URL (24 hour expiry)
    const url = s3.getSignedUrl('getObject', {
      Bucket: bucket,
      Key: key,
      Expires: 86400
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
      status: 'processing'
    };

    try {
      // Get video duration
      const videoStream = s3.getObject({
        Bucket: bucket,
        Key: key
      }).createReadStream();
      
      const duration = await getVideoDurationInSeconds(videoStream);
      metadata.duration = duration;
      metadata.status = 'ready';
    } catch (error) {
      console.error('Error getting video duration:', error);
      metadata.status = 'error';
    }

    await collection.insertOne(metadata);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Metadata processing completed' })
  };
}

async function handleAPIRequest(event, collection) {
  switch (event.httpMethod) {
    case 'GET':
      if (event.path === '/videos') {
        // List all videos
        const videos = await collection.find({ status: 'ready' })
          .sort({ uploadDate: -1 })
          .toArray();
        
        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify(videos)
        };
      } else if (event.pathParameters?.videoId) {
        // Get specific video
        const video = await collection.findOne({
          _id: new ObjectId(event.pathParameters.videoId)
        });
        
        if (!video) {
          return {
            statusCode: 404,
            headers: {
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'Video not found' })
          };
        }

        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify(video)
        };
      }
      break;

    case 'DELETE':
      if (event.pathParameters?.videoId) {
        const video = await collection.findOne({
          _id: new ObjectId(event.pathParameters.videoId)
        });
        
        if (!video) {
          return {
            statusCode: 404,
            headers: {
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({ error: 'Video not found' })
          };
        }

        // Delete from S3
        await s3.deleteObject({
          Bucket: video.s3Bucket,
          Key: video.s3Key
        }).promise();

        // Delete from MongoDB
        await collection.deleteOne({ _id: new ObjectId(event.pathParameters.videoId) });

        return {
          statusCode: 200,
          headers: {
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({ message: 'Video deleted successfully' })
        };
      }
      break;
  }

  return {
    statusCode: 400,
    headers: {
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ error: 'Invalid request' })
  };
}