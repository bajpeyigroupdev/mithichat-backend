const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const mongoUri = 'mongodb+srv://server:2JeLjI3MEpUms8K4@cluster0.j4nkvts.mongodb.net/umang?appName=Cluster0/umang';

mongoose.connect(mongoUri)
  .then(async () => {
    console.log('Connected to MongoDB');
    
    // Define schema inline to avoid imports issues
    const UserSchema = new mongoose.Schema({
      userId: { type: Number, required: true, unique: true },
      name: { type: String },
      email: { type: String, unique: true },
      password: { type: String },
      role: { type: String },
      gender: { type: String },
      isOnline: { type: Boolean, default: false },
      isBlocked: { type: Boolean, default: false }
    }, { collection: 'users' });

    const User = mongoose.model('User', UserSchema);

    // Find max userId
    const lastUser = await User.findOne().sort({ userId: -1 });
    const nextUserId = lastUser ? lastUser.userId + 1 : 10001;

    const email = 'deepak@operator.com';
    const passwordPlain = 'deepak123';
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(passwordPlain, salt);

    // Check if email already exists
    const existing = await User.findOne({ email });
    if (existing) {
      console.log('User already exists! ID:', existing.userId);
      await mongoose.disconnect();
      return;
    }

    const newUser = await User.create({
      userId: nextUserId,
      name: 'Deepak',
      email: email,
      password: hashedPassword,
      role: 'operator',
      gender: 'male',
      isOnline: false,
      isBlocked: false
    });

    console.log('✅ Operator Deepak created successfully!');
    console.log('User ID (Numeric):', newUser.userId);
    console.log('MongoDB ID:', newUser._id.toString());
    console.log('Email:', email);
    console.log('Password:', passwordPlain);
    
    await mongoose.disconnect();
  })
  .catch(err => {
    console.error('Error:', err);
  });
