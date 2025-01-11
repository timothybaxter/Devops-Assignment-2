import { MongoClient } from 'mongodb';
import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { EC2Client, DescribeInstancesCommand, ModifyInstanceAttributeCommand, StopInstancesCommand, StartInstancesCommand } from '@aws-sdk/client-ec2';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
let ffmpeg;
try {
  ffmpeg = (await import('fluent-ffmpeg')).default;
} catch (error) {
  console.error('Error importing fluent-ffmpeg:', error);
}
import fs from 'fs';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'videos-db';
const EC2_INSTANCE_ID = process.env.EC2_INSTANCE_ID;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type': 'application/json'
};

const s3Client = new S3Client({ region: 'us-east-1' });
const ec2Client = new EC2Client({ region: 'us-east-1' });

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const client = await MongoClient.connect(MONGODB_URI);
  cachedDb = client.db(DB_NAME);
  return cachedDb;
}

async function generateThumbnail(bucket, key) {
  const thumbnailKey = `thumbnails/${key.split('/').pop().replace('.mp4', '.jpg')}`;
  
  try {
    // Get signed URL for video
    const getObjectCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    const signedUrl = await getSignedUrl(s3Client, getObjectCommand, { expiresIn: 3600 });

    // Generate thumbnail
    await new Promise((resolve, reject) => {
      ffmpeg(signedUrl)
        .screenshots({
          timestamps: ['00:00:01.000'],
          filename: 'thumbnail.jpg',
          folder: '/tmp',
          size: '320x240'
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Upload thumbnail to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: thumbnailKey,
      Body: fs.readFileSync('/tmp/thumbnail.jpg'),
      ContentType: 'image/jpeg'
    }));

    return `https://${bucket}.s3.amazonaws.com/${thumbnailKey}`;
  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return null;
  }
}

async function syncVideoToEC2(bucket, key, eventType) {
  try {
    const describeCommand = new DescribeInstancesCommand({
      InstanceIds: [EC2_INSTANCE_ID]
    });
    const instanceData = await ec2Client.send(describeCommand);
    const publicIp = instanceData.Reservations[0].Instances[0].PublicIpAddress;

    let userData;
    if (eventType.startsWith('ObjectCreated')) {
      userData = Buffer.from(`#!/bin/bash
        cd /home/ec2-user
        aws s3 cp s3://${bucket}/${key} /usr/share/nginx/html/videos/
        sudo chown nginx:nginx /usr/share/nginx/html/videos/*
        sudo chmod 644 /usr/share/nginx/html/videos/*
        sudo systemctl restart nginx
        `).toString('base64');
    } else if (eventType.startsWith('ObjectRemoved')) {
      userData = Buffer.from(`#!/bin/bash
      cd /home/ec2-user
      rm -f /usr/share/nginx/html/videos/${key.split('/').pop()}
      service nginx restart
      `).toString('base64');
    }

    const modifyCommand = new ModifyInstanceAttributeCommand({
      InstanceId: EC2_INSTANCE_ID,
      UserData: { Value: userData }
    });
    await ec2Client.send(modifyCommand);

    const stopCommand = new StopInstancesCommand({
      InstanceIds: [EC2_INSTANCE_ID]
    });
    await ec2Client.send(stopCommand);

    let stopped = false;
    while (!stopped) {
      const status = await ec2Client.send(describeCommand);
      const state = status.Reservations[0].Instances[0].State.Name;
      if (state === 'stopped') {
        stopped = true;
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    const startCommand = new StartInstancesCommand({
      InstanceIds: [EC2_INSTANCE_ID]
    });
    await ec2Client.send(startCommand);

    return publicIp;
  } catch (error) {
    console.error('Error syncing to EC2:', error);
    throw error;
  }
}

async function processS3Event(record) {
  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
  const size = record.s3.object.size;
  const eventName = record.eventName;

  if (!key.startsWith('videos/') || !key.toLowerCase().endsWith('.mp4')) {
    console.log('Skipping non-video file:', key);
    return null;
  }

  if (eventName.startsWith('ObjectRemoved:')) {
    const db = await connectToDatabase();
    await db.collection('videos').deleteOne({ key: key });
    console.log('Deleted video metadata for:', key);
    await syncVideoToEC2(bucket, key, eventName);
    return;
  }

  try {
    const headObjectCommand = new HeadObjectCommand({
      Bucket: bucket,
      Key: key
    });
    
    const s3Object = await s3Client.send(headObjectCommand);
    
    // Generate thumbnail
    const thumbnailUrl = await generateThumbnail(bucket, key);
    
    const videoMetadata = {
      key: key,
      filename: key.split('/').pop(),
      size: size,
      contentType: s3Object.ContentType,
      lastModified: s3Object.LastModified,
      uploadDate: new Date(),
      url: `https://${bucket}.s3.amazonaws.com/${key}`,
      thumbnailUrl: thumbnailUrl,
      status: 'active'
    };

    const db = await connectToDatabase();
    await db.collection('videos').updateOne(
      { key: key },
      { $set: videoMetadata },
      { upsert: true }
    );

    const publicIp = await syncVideoToEC2(bucket, key, eventName);
    const streamingUrl = `http://${publicIp}/videos/${videoMetadata.filename}`;
    await db.collection('videos').updateOne(
      { key: key },
      { $set: { streamingUrl: streamingUrl } }
    );

    console.log('Successfully processed video:', key);
    return { ...videoMetadata, streamingUrl };
  } catch (error) {
    console.error('Error processing video:', key, error);
    throw error;
  }
}

export const handler = async (event) => {
  console.log('Raw event:', JSON.stringify(event, null, 2));

  // Handle OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'OK' })
    };
  }

  try {
    // Handle GET request for video listing
    if (event.httpMethod === 'GET') {
      const db = await connectToDatabase();
      const videos = await db.collection('videos')
        .find({ status: 'active' })
        .sort({ uploadDate: -1 })
        .toArray();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(videos)
      };
    }

    // Handle S3 events
    if (event.Records) {
      const results = await Promise.all(
        event.Records.map(record => processS3Event(record))
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Processed S3 events successfully',
          results: results.filter(r => r !== null)
        })
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid request' })
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