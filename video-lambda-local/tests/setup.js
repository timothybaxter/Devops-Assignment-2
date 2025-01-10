import { vi } from 'vitest';

// Set environment variables
process.env.MONGODB_URI = 'mongodb+srv://tbaxter:dundeeuni@cluster0.6ehi6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
process.env.EC2_INSTANCE_ID = 'i-12345';
process.env.AWS_REGION = 'us-east-1';

// Mock environment variables for AWS
process.env.AWS_ACCESS_KEY_ID = 'test-key';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';