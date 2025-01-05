const AWS = require('aws-sdk');
const { MongoClient } = require('mongodb');
const jwt = require('jsonwebtoken');

// Initialize AWS services
const s3 = new AWS.S3();
const cloudFront = new AWS.CloudFront();
const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const CLOUDFRONT_DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID;
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN;

// MongoDB connection
let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) {
        return cachedDb;
    }
    const client = await MongoClient.connect(process.env.MONGODB_URI);
    const db = client.db('videos-db');
    cachedDb = db;
    return db;
}

// Verify JWT token
const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        throw new Error('Invalid token');
    }
};

// Generate signed URL for video upload
async function generateUploadUrl(key) {
    const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Expires: 3600, // URL expires in 1 hour
        ContentType: 'video/*'
    };
    return await s3.getSignedUrlPromise('putObject', params);
}

// Generate CloudFront signed URL for video streaming
async function generateStreamUrl(key) {
    const url = `https://${CLOUDFRONT_DOMAIN}/${key}`;
    return url;
}

exports.handler = async (event) => {
    try {
        // Extract authorization header
        const authHeader = event.headers.Authorization;
        if (!authHeader) {
            return {
                statusCode: 401,
                body: JSON.stringify({ message: 'No authorization token provided' })
            };
        }

        // Verify JWT token
        const token = authHeader.split(' ')[1];
        const decoded = verifyToken(token);

        const db = await connectToDatabase();
        const videosCollection = db.collection('videos');

        // Handle different HTTP methods
        switch (event.httpMethod) {
            case 'POST': {
                // Handle video upload request
                const body = JSON.parse(event.body);
                const { title, description, fileName } = body;
                
                // Generate unique key for S3
                const key = `videos/${decoded.userId}/${Date.now()}-${fileName}`;
                
                // Generate upload URL
                const uploadUrl = await generateUploadUrl(key);
                
                // Store video metadata in MongoDB
                const video = {
                    userId: decoded.userId,
                    title,
                    description,
                    key,
                    status: 'pending',
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                
                await videosCollection.insertOne(video);
                
                return {
                    statusCode: 200,
                    body: JSON.stringify({
                        uploadUrl,
                        videoId: video._id
                    })
                };
            }

            case 'GET': {
                if (event.pathParameters && event.pathParameters.id) {
                    // Get single video
                    const video = await videosCollection.findOne({
                        _id: event.pathParameters.id,
                        userId: decoded.userId
                    });
                    
                    if (!video) {
                        return {
                            statusCode: 404,
                            body: JSON.stringify({ message: 'Video not found' })
                        };
                    }
                    
                    // Generate streaming URL
                    const streamUrl = await generateStreamUrl(video.key);
                    
                    return {
                        statusCode: 200,
                        body: JSON.stringify({
                            ...video,
                            streamUrl
                        })
                    };
                } else {
                    // List all videos for user
                    const videos = await videosCollection
                        .find({ userId: decoded.userId })
                        .sort({ createdAt: -1 })
                        .toArray();
                    
                    return {
                        statusCode: 200,
                        body: JSON.stringify(videos)
                    };
                }
            }

            default:
                return {
                    statusCode: 405,
                    body: JSON.stringify({ message: 'Method not allowed' })
                };
        }
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Internal server error' })
        };
    }
};