const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Room = require('./models/Room');
const Wardrobe = require('./models/Wardrobe');
require('dotenv').config();

async function testWardrobeCreation() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    const mongoUriWithDb = mongoUri.includes('myntra-fashion') 
      ? mongoUri 
      : mongoUri.replace('mongodb.net/', 'mongodb.net/myntra-fashion');

    await mongoose.connect(mongoUriWithDb, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Connected to MongoDB');

    // Get a test user and room
    const user = await User.findOne({});
    const room = await Room.findOne({});

    if (!user || !room) {
      console.log('❌ No user or room found. Please run the seed script first.');
      return;
    }

    console.log('👤 Test user:', user.email);
    console.log('🏠 Test room:', room.name, 'ID:', room._id);

    // Test wardrobe data
    const wardrobeData = {
      name: 'Test Wardrobe',
      emoji: '👗',
      description: 'Test description',
      occasionType: 'General Collection',
      isPrivate: false,
      roomId: room._id.toString(),
      members: []
    };

    console.log('📝 Testing wardrobe data:', wardrobeData);

    // Test ObjectId validation
    console.log('🔍 ObjectId validation:');
    console.log('  roomId is valid:', mongoose.Types.ObjectId.isValid(wardrobeData.roomId));

    // Test creating wardrobe directly
    const wardrobe = new Wardrobe({
      name: wardrobeData.name,
      emoji: wardrobeData.emoji,
      description: wardrobeData.description,
      occasionType: wardrobeData.occasionType,
      budgetRange: { min: 0, max: 50000 },
      isPrivate: wardrobeData.isPrivate,
      owner: user._id,
      roomId: new mongoose.Types.ObjectId(wardrobeData.roomId),
      members: []
    });

    await wardrobe.save();
    console.log('✅ Wardrobe created successfully:', wardrobe._id);

    // Clean up
    await Wardrobe.findByIdAndDelete(wardrobe._id);
    console.log('🧹 Test wardrobe cleaned up');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

testWardrobeCreation();







