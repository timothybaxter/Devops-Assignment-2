import { vi } from 'vitest';

// Set environment variables
process.env.MONGODB_URI = 'mongodb+srv://tbaxter:dundeeuni@cluster0.6ehi6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// Mock environment variables
process.env.JWT_SECRET = 'test-secret';