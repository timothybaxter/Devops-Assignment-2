// tests/video.test.js
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock AWS SDK clients
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({
    send: vi.fn().mockResolvedValue({
      Body: 'fake-video-data',
      ContentType: 'video/mp4',
      LastModified: new Date()
    })
  })),
  HeadObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  PutObjectCommand: vi.fn()
}));

// Mock EC2 client with immediate responses
vi.mock('@aws-sdk/client-ec2', () => {
  const mockSendFunction = vi.fn()
    .mockResolvedValueOnce({ // First call - describe instances
      Reservations: [{
        Instances: [{
          PublicIpAddress: '1.2.3.4',
          State: { Name: 'running' }
        }]
      }]
    })
    .mockResolvedValueOnce({ }) // Second call - modify instance
    .mockResolvedValueOnce({ }) // Third call - stop instances
    .mockResolvedValueOnce({ // Fourth call - describe instances (stopped)
      Reservations: [{
        Instances: [{
          State: { Name: 'stopped' }
        }]
      }]
    })
    .mockResolvedValueOnce({ }); // Fifth call - start instances

  return {
    EC2Client: vi.fn(() => ({
      send: mockSendFunction
    })),
    DescribeInstancesCommand: vi.fn(),
    ModifyInstanceAttributeCommand: vi.fn(),
    StopInstancesCommand: vi.fn(),
    StartInstancesCommand: vi.fn()
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://fake-signed-url.com')
}));

// Mock ffmpeg with immediate success
vi.mock('fluent-ffmpeg', () => {
  return {
    default: vi.fn().mockReturnValue({
      screenshots: vi.fn().mockReturnThis(),
      on: vi.fn().mockImplementation(function(event, callback) {
        if (event === 'end') {
          callback();
        }
        return this;
      })
    })
  };
});

vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-image-data'))
  },
  readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-image-data'))
}));

vi.mock('mongodb', () => {
  const mockCollection = {
    find: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue([]),
    findOne: vi.fn(),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 })
  };

  const mockDb = {
    collection: vi.fn().mockReturnValue(mockCollection)
  };

  return {
    MongoClient: {
      connect: vi.fn().mockResolvedValue({
        db: vi.fn().mockReturnValue(mockDb)
      })
    }
  };
});

// Import handler after mocks
import { handler } from '../index.mjs';

describe('Video Lambda Handler Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.cachedDb = null;
    process.env.EC2_INSTANCE_ID = 'i-12345';
    // Reset setTimeout to its original implementation for each test
    vi.useRealTimers();
  });

  describe('GET Request Tests', () => {
    test('successfully lists videos', async () => {
      const mockVideos = [
        {
          key: 'videos/test1.mp4',
          filename: 'test1.mp4',
          url: 'https://bucket.s3.amazonaws.com/videos/test1.mp4',
          status: 'active'
        }
      ];

      const { MongoClient } = await import('mongodb');
      MongoClient.connect().then(client => 
        client.db().collection().find().sort().toArray.mockResolvedValueOnce(mockVideos)
      );

      const event = {
        httpMethod: 'GET'
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('S3 Event Tests', () => {
    test('processes video upload event', async () => {
      // Use fake timers for this test to speed up polling
      vi.useFakeTimers();
      
      const event = {
        Records: [{
          eventName: 'ObjectCreated:Put',
          s3: {
            bucket: { name: 'test-bucket' },
            object: {
              key: 'videos/test.mp4',
              size: 1024
            }
          }
        }]
      };

      const responsePromise = handler(event);
      // Fast-forward through any setTimeout calls
      vi.runAllTimers();
      
      const response = await responsePromise;
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('message', 'Processed S3 events successfully');
    }, 60000); // Increase timeout just in case
  });

  describe('Error Handling', () => {
    test('handles invalid requests', async () => {
      const event = {
        httpMethod: 'POST',
        body: JSON.stringify({ invalid: 'request' })
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Invalid request');
    });
  });
});