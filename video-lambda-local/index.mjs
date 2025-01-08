import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { SSMClient, SendCommandCommand } from '@aws-sdk/client-ssm';
import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { MongoClient } from 'mongodb';

const s3Client = new S3Client({ region: 'us-east-1' });
const ssmClient = new SSMClient({ region: 'us-east-1' });
const ec2Client = new EC2Client({ region: 'us-east-1' });

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'videos-db';

let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  const client = await MongoClient.connect(MONGODB_URI);
  cachedDb = client.db(DB_NAME);
  return cachedDb;
}

async function getEC2Instance() {
  const command = new DescribeInstancesCommand({
    Filters: [{
      Name: 'tag:Name',
      Values: ['video-streaming']
    }]
  });
  const { Reservations } = await ec2Client.send(command);
  return Reservations[0].Instances[0];
}

async function updateEC2WithVideo(bucket, key, fileName) {
  try {
    const instance = await getEC2Instance();
    const command = `
      aws s3 cp s3://${bucket}/${key} /home/ec2-user/video-service/mp4/${fileName} &&
      cd /home/ec2-user/video-service &&
      docker restart videoserv || (
        docker rm -f videoserv;
        docker run -d -p 1935:1935 -p 80:80 --name videoserv -v $PWD/mp4:/var/mp4s -v $PWD/www:/var/www video /usr/local/nginx-streaming/sbin/nginx
      )
    `;

    await ssmClient.send(new SendCommandCommand({
      InstanceIds: [instance.InstanceId],
      DocumentName: 'AWS-RunShellScript',
      Parameters: { commands: [command] }
    }));
    
    return instance.PublicIpAddress;
  } catch (error) {
    console.error('EC2 update error:', error);
    throw error;
  }
}

export const handler = async (event) => {
  try {
    console.log('Event received:', JSON.stringify(event, null, 2));
    const db = await connectToDatabase();
    const videosCollection = db.collection('videos');

    if (event.Records) {
      for (const record of event.Records) {
        if (record.eventName.startsWith('ObjectCreated:')) {
          await handleS3Create(record, videosCollection);
        } else if (record.eventName.startsWith('ObjectRemoved:')) {
          await handleS3Delete(record, videosCollection);
        }
      }
      return { statusCode: 200, body: JSON.stringify({ message: 'Success' }) };
    }

    return { statusCode: 400, body: JSON.stringify({ message: 'Invalid event' }) };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', details: error.message })
    };
  }
};

async function handleS3Create(record, collection) {
  const bucket = record.s3.bucket.name;
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
  const fileName = key.split('/').pop();

  try {
    // Get S3 metadata
    const headCommand = new HeadObjectCommand({ Bucket: bucket, Key: key });
    const s3Object = await s3Client.send(headCommand);

    // Update EC2 and get public IP
    const publicIp = await updateEC2WithVideo(bucket, key, fileName);

    // Create metadata
    const metadata = {
      fileName,
      s3Key: key,
      s3Bucket: bucket,
      uploadDate: new Date(),
      contentType: s3Object.ContentType,
      size: s3Object.ContentLength,
      streamingUrl: `http://${publicIp}/vod2/${fileName}`,
      status: 'ready'
    };

    await collection.insertOne(metadata);
    console.log('Video processed successfully:', metadata);
  } catch (error) {
    console.error('Error processing video:', error);
    throw error;
  }
}

async function handleS3Delete(record, collection) {
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
  await collection.deleteOne({ s3Key: key });
}