import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

console.log('Auth Lambda function executed');
console.log('Testing automatic deployment via webhook - ' + new Date().toISOString());

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
    console.error('MongoDB connection error:', error.message); // Add debug log
    throw new Error('Database connection failed'); // Custom error message
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
  try {
    let parsedBody;

    // Parse request body
    try {
      parsedBody = JSON.parse(event.body);
    } catch (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal server error' }),
      };
    }

    // Validate basic request structure
    if (!parsedBody.action || !parsedBody.payload) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid action' }),
      };
    }

    // Connect to database before any operations
    try {
      const db = await connectToDatabase();
      if (!db) {
        throw new Error('Database connection failed');
      }
    } catch (error) {
      console.error('Database connection error:', error.message);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal server error' }),
      };
    }

    const { action, payload } = parsedBody;

    switch (action) {
      case 'register':
        if (!validateRegistrationInput(payload)) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing required fields' }),
          };
        }
        return await handleRegister(payload);

      case 'login':
        if (!validateLoginInput(payload)) {
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing required fields' }),
          };
        }
        return await handleLogin(payload);

      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ error: 'Invalid action' }),
        };
    }
  } catch (error) {
    console.error('Error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};

async function handleRegister({ email, password, name }) {
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Email already registered' }),
      };
    }

    const user = new User({ email, password, name });
    await user.save();

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return {
      statusCode: 201,
      body: JSON.stringify({
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
        },
      }),
    };
  } catch (error) {
    console.error('Registration error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Registration failed' }),
    };
  }
}

async function handleLogin({ email, password }) {
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' }),
      };
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid credentials' }),
      };
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
        },
      }),
    };
  } catch (error) {
    console.error('Login error:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Login failed' }),
    };
  }
}
