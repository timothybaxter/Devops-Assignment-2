// tests/watchlist.test.js
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock MongoDB
vi.mock('mongodb', () => {
  const mockUpdateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
  const mockFindOne = vi.fn();

  const mockCollection = {
    findOne: mockFindOne,
    updateOne: mockUpdateOne
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

// Import handler after mocks - Changed from .js to .mjs
import { handler } from '../index.mjs';
import { MongoClient } from 'mongodb';

describe('Watchlist Lambda Handler Tests', () => {
  const mockUserId = 'user123';

  beforeEach(() => {
    vi.clearAllMocks();
    global.cachedDb = null;
  });

  describe('GET Request Tests', () => {
    test('successfully gets empty watchlist when none exists', async () => {
      // Mock findOne to return null (no watchlist exists)
      const { connect } = MongoClient;
      const mockDb = (await connect()).db();
      mockDb.collection().findOne.mockResolvedValueOnce(null);

      const event = {
        httpMethod: 'GET',
        queryStringParameters: {
          userId: mockUserId
        }
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(0);
    });

    test('successfully gets existing watchlist', async () => {
      // Mock existing watchlist
      const mockWatchlist = {
        userId: mockUserId,
        videos: ['video1', 'video2']
      };

      const { connect } = MongoClient;
      const mockDb = (await connect()).db();
      mockDb.collection().findOne.mockResolvedValueOnce(mockWatchlist);

      const event = {
        httpMethod: 'GET',
        queryStringParameters: {
          userId: mockUserId
        }
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body).toContain('video1');
    });

    test('returns 400 for missing userId', async () => {
      const event = {
        httpMethod: 'GET',
        queryStringParameters: {}
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Missing userId parameter');
    });
  });

  describe('POST Request Tests', () => {
    test('successfully adds video to watchlist', async () => {
      const event = {
        httpMethod: 'POST',
        body: JSON.stringify({
          userId: mockUserId,
          videoId: 'video1'
        })
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(200);

      // Verify updateOne was called with correct parameters
      const { connect } = MongoClient;
      const mockDb = (await connect()).db();
      expect(mockDb.collection().updateOne).toHaveBeenCalledWith(
        { userId: mockUserId },
        expect.objectContaining({
          $addToSet: { videos: 'video1' }
        }),
        expect.anything()
      );
    });

    test('successfully removes video from watchlist', async () => {
      const event = {
        httpMethod: 'POST',
        body: JSON.stringify({
          userId: mockUserId,
          videoId: 'video1',
          action: 'remove'
        })
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(200);

      // Verify updateOne was called with correct parameters
      const { connect } = MongoClient;
      const mockDb = (await connect()).db();
      expect(mockDb.collection().updateOne).toHaveBeenCalledWith(
        { userId: mockUserId },
        expect.objectContaining({
          $pull: { videos: 'video1' }
        })
      );
    });

    test('returns 400 for missing required fields', async () => {
      const event = {
        httpMethod: 'POST',
        body: JSON.stringify({
          userId: mockUserId
          // missing videoId
        })
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Missing required fields');
    });
  });

  describe('Error Handling', () => {
    test('handles database errors gracefully', async () => {
      // Mock database error by making collection.findOne reject
      const { connect } = MongoClient;
      const mockDb = (await connect()).db();
      mockDb.collection().findOne.mockRejectedValueOnce(new Error('Database query failed'));

      const event = {
        httpMethod: 'GET',
        queryStringParameters: {
          userId: mockUserId
        }
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body)).toHaveProperty('error');
    });

    test('handles invalid request method', async () => {
      const event = {
        httpMethod: 'PUT'
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Invalid request method');
    });
  });
});