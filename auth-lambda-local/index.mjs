import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

console.log('Auth Lambda function executed');

// Format response with CORS headers
const formatResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': true,
    'Access-Control-Allow-Methods': 'OPTIONS,POST',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  },
  body: JSON.stringify(body),
});

// User Schema
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

const User = mongoose.model('User', userSchema);

// MongoDB connection handling
let cachedDb = null;

async function connectToDatabase() {
  try {
    if (cachedDb) {
      return cachedDb;
    }

    const connection = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    cachedDb = connection;
    return cachedDb;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    throw new Error('Database connection failed');
  }
}

// Validation functions
function validateLoginInput(payload) {
  return payload && payload.email && payload.password;
}

function validateRegistrationInput(payload) {
  return payload && payload.email && payload.password && payload.name;
}

// Lambda handler
export const handler = async (event) => {
  // Log the incoming event
  console.log('Received event:', JSON.stringify(event, null, 2));

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return formatResponse(200, {});
  }

  try {
    let parsedBody;

    // Parse request body with better error handling
    try {
      console.log('Raw event.body:', event.body);
      parsedBody = JSON.parse(event.body);
    } catch (error) {
      console.error('Body parsing error:', error.message);
      return formatResponse(400, { error: 'Invalid request body' });
    }

    // Validate basic request structure
    if (!parsedBody.action || !parsedBody.payload) {
      return formatResponse(400, { error: 'Invalid request format - missing action or payload' });
    }

    // Connect to the database
    try {
      const db = await connectToDatabase();
      if (!db) {
        throw new Error('Database connection failed');
      }
    } catch (error) {
      console.error('Database connection error:', error.message);
      return formatResponse(500, { error: 'Database connection failed' });
    }

    const { action, payload } = parsedBody;

    switch (action) {
      case 'register':
        if (!validateRegistrationInput(payload)) {
          return formatResponse(400, { error: 'Missing required registration fields' });
        }
        return await handleRegister(payload);

      case 'login':
        if (!validateLoginInput(payload)) {
          return formatResponse(400, { error: 'Missing required login fields' });
        }
        return await handleLogin(payload);

      default:
        return formatResponse(400, { error: 'Invalid action specified' });
    }
  } catch (error) {
    console.error('Unhandled error:', error.message);
    return formatResponse(500, { error: 'Internal server error' });
  }
};

async function handleRegister({ email, password, name }) {
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return formatResponse(400, { error: 'Email already registered' });
    }

    const user = new User({ email, password, name });
    await user.save();

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return formatResponse(201, {
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Registration error:', error.message);
    return formatResponse(500, { error: 'Registration failed' });
  }
}

async function handleLogin({ email, password }) {
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return formatResponse(401, { error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return formatResponse(401, { error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return formatResponse(200, {
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return formatResponse(500, { error: 'Login failed' });
  }
}
