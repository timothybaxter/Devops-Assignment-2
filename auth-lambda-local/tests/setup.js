import { vi } from 'vitest';

// Set environment variables
process.env.MONGODB_URI = 'mongodb+srv://tbaxter:dundeeuni@cluster0.6ehi6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
process.env.JWT_SECRET = '889e92b80dc8447d4a4bd2daaa8bf28523cab7fe3f577ba02dbd232a9d18258c62f72a82ed992a6a0cfdd653d6e9a07f2116b371a130f3c52643717acb167698';

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashedPassword'),
    compare: vi.fn().mockResolvedValue(true)
  }
}));

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('mock.jwt.token')
  }
}));