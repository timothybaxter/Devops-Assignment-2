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

// Mock modules must be defined before importing the handler
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
      model: vi.fn().mockReturnValue(mockModel)
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

// Import the handler after mocks are set up
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
    // Clear all mocks
    vi.clearAllMocks();

    // Reset database connection
    global.cachedDb = null;

    // Get fresh instance of User model for each test
    User = mongoose.model('User');
    User.findOne.mockReset();

    // Reset mongoose connect mock with default success
    mongoose.connect.mockReset();
    mongoose.connect.mockResolvedValue({ connection: true });

    // Set up environment variables
    process.env.JWT_SECRET = 'test-secret';
    process.env.MONGODB_URI = 'mongodb://test-uri/users-db';
  });

  describe('Login Tests', () => {
    test('successful login returns 200 and token', async () => {
      User.findOne.mockResolvedValueOnce({
        ...mockUser,
        save: vi.fn().mockResolvedValue(true)
      });

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
      expect(body).toHaveProperty('user');
      expect(body.user).toHaveProperty('email', 'test@example.com');
      expect(body.user).not.toHaveProperty('password');
    });

    test('login with wrong password returns 401', async () => {
      User.findOne.mockResolvedValueOnce({
        ...mockUser,
        save: vi.fn().mockResolvedValue(true)
      });

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

    test('login with non-existent email returns 401', async () => {
      User.findOne.mockResolvedValueOnce(null);

      const event = {
        body: JSON.stringify({
          action: 'login',
          payload: {
            email: 'nonexistent@example.com',
            password: 'anypassword'
          }
        })
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Invalid credentials');
    });
  });

  describe('Registration Tests', () => {
    test('successful registration returns 201', async () => {
      User.findOne.mockResolvedValueOnce(null);

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
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('token');
      expect(body).toHaveProperty('user');
      expect(body.user).toHaveProperty('email', 'newuser@example.com');
      expect(body.user).toHaveProperty('name', 'New User');
      expect(body.user).not.toHaveProperty('password');
    });

    test('registration with existing email returns 400', async () => {
      User.findOne.mockResolvedValueOnce({
        ...mockUser,
        save: vi.fn().mockResolvedValue(true)
      });

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
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Email already registered');
    });
  });

  describe('Input Validation', () => {
    test('missing email in login returns 400', async () => {
      const event = {
        body: JSON.stringify({
          action: 'login',
          payload: {
            password: 'password123'
          }
        })
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Missing required fields');
    });

    test('missing password in login returns 400', async () => {
      const event = {
        body: JSON.stringify({
          action: 'login',
          payload: {
            email: 'test@example.com'
          }
        })
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Missing required fields');
    });

    test('missing name in registration returns 400', async () => {
      const event = {
        body: JSON.stringify({
          action: 'register',
          payload: {
            email: 'test@example.com',
            password: 'password123'
          }
        })
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Missing required fields');
    });

    test('empty payload returns 400', async () => {
      const event = {
        body: JSON.stringify({
          action: 'login',
          payload: {}
        })
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Missing required fields');
    });

    test('missing action returns 400', async () => {
      const event = {
        body: JSON.stringify({
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

  describe('Error Handling', () => {
    test('invalid JSON in request body returns 500', async () => {
      const event = {
        body: 'invalid json {'
      };

      const response = await handler(event);
      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Internal server error');
    });

    test('save operation error returns 500', async () => {
      User.findOne.mockResolvedValueOnce(null);

      const mockUserInstance = new MockUser({
        email: 'test@example.com',
        name: 'Test User',
      });

      mockUserInstance.save = vi.fn().mockRejectedValue(new Error('Save operation failed'));
      User.mockImplementation(() => mockUserInstance);

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
      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Registration failed');
    });

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
      expect(JSON.parse(response.body)).toHaveProperty('error', 'Login failed');
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