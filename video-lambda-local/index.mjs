import { MongoClient } from 'mongodb';
import { S3Client, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { EC2Client, DescribeInstancesCommand, ModifyInstanceAttributeCommand, StopInstancesCommand, StartInstancesCommand } from '@aws-sdk/client-ec2';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'videos-db';
const EC2_INSTANCE_ID = process.env.EC2_INSTANCE_ID;

const s3Client = new S3Client({ region: 'us-east-1' });
const ec2Client = new EC2Client({ region: 'us-east-1' });

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const client = await MongoClient.connect(MONGODB_URI);
  cachedDb = client.db(DB_NAME);
  return cachedDb;
}

async function syncVideoToEC2(bucket, key, eventType) {
  try {
    // Get EC2 instance info
    const describeCommand = new DescribeInstancesCommand({
      InstanceIds: [EC2_INSTANCE_ID]
    });
    const instanceData = await ec2Client.send(describeCommand);
    const publicIp = instanceData.Reservations[0].Instances[0].PublicIpAddress;

    // Create user data script
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

    // Update EC2 user data
    const modifyCommand = new ModifyInstanceAttributeCommand({
      InstanceId: EC2_INSTANCE_ID,
      UserData: {
        Value: userData
      }
    });
    await ec2Client.send(modifyCommand);

    // Stop instance
    const stopCommand = new StopInstancesCommand({
      InstanceIds: [EC2_INSTANCE_ID]
    });
    await ec2Client.send(stopCommand);

    // Wait for instance to stop (simple polling)
    let stopped = false;
    while (!stopped) {
      const status = await ec2Client.send(describeCommand);
      const state = status.Reservations[0].Instances[0].State.Name;
      if (state === 'stopped') {
        stopped = true;
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      }
    }

    // Start instance
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
    
    // Sync deletion to EC2
    await syncVideoToEC2(bucket, key, eventName);
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

    // Sync video to EC2
    const publicIp = await syncVideoToEC2(bucket, key, eventName);
    
    // Update metadata with streaming URL
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