// tests/auth.test.js
import { describe, test, expect, vi, beforeEach } from 'vitest';

// Create a mock User class
class MockUser {
  constructor(data) {
    Object.assign(this, data);
  }
  save() {
    return Promise.resolve(this);
  }
}

// Initialize global cachedDb as null
global.cachedDb = null;

// Mock modules
vi.mock('mongoose', () => {
  const mockModel = vi.fn().mockImplementation((data) => new MockUser(data));
  mockModel.findOne = vi.fn();

  return {
    default: {
      connect: vi.fn().mockResolvedValue(true),
      Schema: vi.fn().mockImplementation(() => ({
        pre: vi.fn().mockReturnThis(),
        index: vi.fn().mockReturnThis()
      })),
      model: vi.fn().mockReturnValue(mockModel),
      connection: {
        readyState: 0
      }
    }
  };
});

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashedPassword'),
    compare: vi.fn().mockImplementation((pass) => Promise.resolve(pass === 'correctpassword'))
  }
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('test.jwt.token')
  }
}));

import mongoose from 'mongoose';
import { handler } from '../index.mjs';

describe('Auth Lambda Handler Tests', () => {
  const mockUser = {
    _id: 'testid123',
    email: 'test@example.com',
    password: 'hashedPassword',
    name: 'Test User'
  };

  let User;

  beforeEach(() => {
    vi.clearAllMocks();
    global.cachedDb = null;
    User = mongoose.model('User');
    User.findOne.mockReset();
    mongoose.connect.mockReset();
    mongoose.connect.mockResolvedValue({ connection: true });
    process.env.JWT_SECRET = 'test-secret';
    process.env.MONGODB_URI = 'mongodb://test-uri/users-db';
  });

  describe('Login Tests', () => {
    test('successful login returns 200 and token', async () => {
      User.findOne.mockResolvedValueOnce(mockUser);

      const event = {
        body: JSON.stringify({
          action: 'login',
          payload: {
            email: 'test@example.com',
            password: 'correctpassword'
          }
        })
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('token');
      expect(body).toHaveProperty('userId', 'testid123');
    });

    test('login with wrong password returns 401', async () => {
      User.findOne.mockResolvedValueOnce(mockUser);

      const event = {
        body: JSON.stringify({
          action: 'login',
          payload: {
            email: 'test@example.com',
            password: 'wrongpassword'
          }
        })
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Invalid credentials');
    });
  });

  describe('Registration Tests', () => {
    test('successful registration returns 200', async () => {
      User.findOne.mockResolvedValueOnce(null);
      
      // Create a mock user with _id
      const mockNewUser = new MockUser({
        _id: 'newuserid123',
        email: 'newuser@example.com',
        password: 'hashedPassword',
        name: 'New User'
      });

      // Mock the User constructor to return our mock user
      User.mockImplementationOnce(() => mockNewUser);

      const event = {
        body: JSON.stringify({
          action: 'register',
          payload: {
            email: 'newuser@example.com',
            password: 'securePass123!',
            name: 'New User'
          }
        })
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('token');
      expect(body).toHaveProperty('userId', 'newuserid123');
    });

    test('registration with existing email returns 400', async () => {
      User.findOne.mockResolvedValueOnce(mockUser);

      const event = {
        body: JSON.stringify({
          action: 'register',
          payload: {
            email: 'test@example.com',
            password: 'password123',
            name: 'Test User'
          }
        })
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toHaveProperty('error', 'User already exists');
    });
  });

  describe('Error Handling', () => {
    test('database operation error returns 500', async () => {
      User.findOne.mockRejectedValueOnce(new Error('Database error'));

      const event = {
        body: JSON.stringify({
          action: 'login',
          payload: {
            email: 'test@example.com',
            password: 'password123'
          }
        })
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Internal server error');
    });

    test('invalid action type returns 400', async () => {
      const event = {
        body: JSON.stringify({
          action: 'invalidAction',
          payload: {
            email: 'test@example.com',
            password: 'password123'
          }
        })
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Invalid action');
    });
  });
});