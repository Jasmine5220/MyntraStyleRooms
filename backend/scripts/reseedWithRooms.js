const mongoose = require('mongoose');
const User = require('../models/User');
const Room = require('../models/Room');
const Wardrobe = require('../models/Wardrobe');
const WardrobeItem = require('../models/WardrobeItem');
const Product = require('../models/Product');
require('dotenv').config();

// Sample data
const sampleUsers = [
  {
    name: 'Priya Sharma',
    email: 'priya@example.com',
    password: '$2b$10$example.hash.here',
    profileImage: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face'
  },
  {
    name: 'Richa Patel',
    email: 'richa@example.com',
    password: '$2b$10$example.hash.here',
    profileImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face'
  },
  {
    name: 'Neyati Singh',
    email: 'neyati@example.com',
    password: '$2b$10$example.hash.here',
    profileImage: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face'
  }
];

const sampleRooms = [
  {
    name: 'Fashion Forward',
    description: 'A trendy room for fashion enthusiasts',
    isPrivate: false,
    settings: {
      allowMemberInvites: true,
      aiSuggestionsEnabled: true,
      autoOutfitGeneration: false
    },
    tags: ['fashion', 'trendy', 'style']
  },
  {
    name: 'Wedding Collection',
    description: 'Elegant pieces for special occasions',
    isPrivate: false,
    settings: {
      allowMemberInvites: true,
      aiSuggestionsEnabled: true,
      autoOutfitGeneration: true
    },
    tags: ['wedding', 'elegant', 'formal']
  },
  {
    name: 'Casual Vibes',
    description: 'Comfortable everyday wear',
    isPrivate: false,
    settings: {
      allowMemberInvites: true,
      aiSuggestionsEnabled: true,
      autoOutfitGeneration: false
    },
    tags: ['casual', 'comfortable', 'everyday']
  },
  {
    name: 'Office Professional',
    description: 'Professional attire for work',
    isPrivate: true,
    settings: {
      allowMemberInvites: true,
      aiSuggestionsEnabled: true,
      autoOutfitGeneration: false
    },
    tags: ['professional', 'office', 'work']
  }
];

const sampleWardrobes = [
  {
    name: 'Family Wedding Collection',
    emoji: '👰',
    description: 'Beautiful collection for family wedding celebrations',
    occasionType: 'Wedding & Celebrations',
    budgetRange: { min: 1000, max: 10000 },
    isPrivate: false,
    settings: {
      allowMemberInvites: true,
      aiSuggestionsEnabled: true,
      autoOutfitGeneration: false
    },
    tags: ['wedding', 'family', 'celebration']
  },
  {
    name: 'Office Professional',
    emoji: '💼',
    description: 'Professional attire for office and meetings',
    occasionType: 'Office & Professional',
    budgetRange: { min: 500, max: 5000 },
    isPrivate: false,
    settings: {
      allowMemberInvites: true,
      aiSuggestionsEnabled: true,
      autoOutfitGeneration: false
    },
    tags: ['office', 'professional', 'work']
  },
  {
    name: 'Casual Weekend',
    emoji: '👕',
    description: 'Comfortable casual wear for weekends',
    occasionType: 'Casual & Weekend',
    budgetRange: { min: 300, max: 3000 },
    isPrivate: false,
    settings: {
      allowMemberInvites: true,
      aiSuggestionsEnabled: true,
      autoOutfitGeneration: false
    },
    tags: ['casual', 'weekend', 'comfortable']
  },
  {
    name: 'Party Night Out',
    emoji: '🎉',
    description: 'Glamorous outfits for parties and night outs',
    occasionType: 'Party & Nightlife',
    budgetRange: { min: 800, max: 8000 },
    isPrivate: true,
    settings: {
      allowMemberInvites: true,
      aiSuggestionsEnabled: true,
      autoOutfitGeneration: true
    },
    tags: ['party', 'night', 'glamorous']
  }
];

const sampleProducts = [
  {
    name: 'Elegant Red Saree',
    price: 4500,
    images: [{ url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=300&h=400&fit=crop' }],
    brand: 'Fabindia',
    category: 'Clothing',
    subcategory: 'Ethnic Wear',
    description: 'Beautiful red silk saree with golden border work',
    isActive: true,
    inStock: true,
    rating: 4.5,
    reviewCount: 120
  },
  {
    name: 'Gold Jhumka Earrings',
    price: 2500,
    images: [{ url: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=300&h=400&fit=crop' }],
    brand: 'Tanishq',
    category: 'Jewelry',
    subcategory: 'Earrings',
    description: 'Traditional gold jhumka earrings with intricate design',
    isActive: true,
    inStock: true,
    rating: 4.8,
    reviewCount: 89
  },
  {
    name: 'Designer Handbag',
    price: 3500,
    images: [{ url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=300&h=400&fit=crop' }],
    brand: 'H&M',
    category: 'Bags',
    subcategory: 'Handbags',
    description: 'Stylish designer handbag perfect for any occasion',
    isActive: true,
    inStock: true,
    rating: 4.3,
    reviewCount: 67
  },
  {
    name: 'Traditional Mojaris',
    price: 1800,
    images: [{ url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=300&h=400&fit=crop' }],
    brand: 'Bata',
    category: 'Footwear',
    subcategory: 'Traditional',
    description: 'Comfortable traditional mojari shoes for special occasions',
    isActive: true,
    inStock: true,
    rating: 4.2,
    reviewCount: 45
  },
  {
    name: 'Pearl Necklace Set',
    price: 6000,
    images: [{ url: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=300&h=400&fit=crop' }],
    brand: 'Tanishq',
    category: 'Jewelry',
    subcategory: 'Necklaces',
    description: 'Classic pearl necklace set with matching earrings',
    isActive: true,
    inStock: true,
    rating: 4.7,
    reviewCount: 156
  },
  {
    name: 'Silk Scarf',
    price: 900,
    images: [{ url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=300&h=400&fit=crop' }],
    brand: 'Fabindia',
    category: 'Accessories',
    subcategory: 'Scarves',
    description: 'Luxurious silk scarf with beautiful patterns',
    isActive: true,
    inStock: true,
    rating: 4.1,
    reviewCount: 34
  }
];

async function reseedDatabase() {
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

    // Clear existing data
    await WardrobeItem.deleteMany({});
    await Wardrobe.deleteMany({});
    await Room.deleteMany({});
    await User.deleteMany({});
    await Product.deleteMany({});
    console.log('🗑️ Cleared existing data');

    // Create users
    const users = [];
    for (const userData of sampleUsers) {
      const user = new User(userData);
      await user.save();
      users.push(user);
    }
    console.log('👥 Created sample users');

    // Create products
    const products = [];
    for (const productData of sampleProducts) {
      const product = new Product(productData);
      await product.save();
      products.push(product);
    }
    console.log('🛍️ Created sample products');

    // Create rooms
    const rooms = [];
    for (let i = 0; i < sampleRooms.length; i++) {
      const roomData = sampleRooms[i];
      const owner = users[i % users.length];
      
      const room = new Room({
        ...roomData,
        owner: owner._id,
        members: [
          {
            userId: owner._id,
            role: 'Owner',
            joinedAt: new Date()
          }
        ]
      });

      // Add other users as members
      const otherUsers = users.filter(u => u._id.toString() !== owner._id.toString());
      for (let j = 0; j < Math.min(otherUsers.length, 3); j++) {
        const role = j === 0 ? 'Editor' : j === 1 ? 'Contributor' : 'Viewer';
        room.members.push({
          userId: otherUsers[j]._id,
          role: role,
          joinedAt: new Date()
        });
      }

      await room.save();
      rooms.push(room);
      console.log(`🏠 Created room "${room.name}"`);
    }

    // Create wardrobes with room associations
    const wardrobes = [];
    for (let i = 0; i < sampleWardrobes.length; i++) {
      const wardrobeData = sampleWardrobes[i];
      const owner = users[i % users.length];
      const room = rooms[i % rooms.length]; // Associate with specific room
      
      const wardrobe = new Wardrobe({
        ...wardrobeData,
        owner: owner._id,
        roomId: room._id, // Associate with specific room
        members: [
          {
            userId: owner._id,
            role: 'Owner',
            joinedAt: new Date()
          }
        ]
      });

      // Add other users as members
      const otherUsers = users.filter(u => u._id.toString() !== owner._id.toString());
      for (let j = 0; j < otherUsers.length; j++) {
        const role = j === 0 ? 'Editor' : j === 1 ? 'Contributor' : 'Viewer';
        wardrobe.members.push({
          userId: otherUsers[j]._id,
          role: role,
          joinedAt: new Date()
        });
      }

      await wardrobe.save();
      wardrobes.push(wardrobe);
      console.log(`👗 Created wardrobe "${wardrobe.name}" in room "${room.name}"`);
    }

    // Add items to wardrobes
    for (let i = 0; i < wardrobes.length; i++) {
      const wardrobe = wardrobes[i];
      const productsToAdd = products.slice(i * 2, (i + 1) * 2);
      
      for (const product of productsToAdd) {
        const wardrobeItem = new WardrobeItem({
          wardrobeId: wardrobe._id,
          productId: product._id,
          addedBy: wardrobe.owner,
          notes: `Added to ${wardrobe.name}`,
          priority: 'medium',
          reactions: [
            {
              userId: wardrobe.owner,
              type: 'love',
              createdAt: new Date()
            }
          ]
        });

        await wardrobeItem.save();
      }
    }
    console.log('📦 Added items to wardrobes');

    // Update counts
    for (const wardrobe of wardrobes) {
      const itemCount = await WardrobeItem.countDocuments({ wardrobeId: wardrobe._id });
      wardrobe.itemCount = itemCount;
      await wardrobe.save();
    }

    for (const room of rooms) {
      room.memberCount = room.members.length;
      await room.save();
    }

    console.log('\n🎉 Database reseeding completed successfully!');
    console.log(`Created ${users.length} users`);
    console.log(`Created ${rooms.length} rooms`);
    console.log(`Created ${wardrobes.length} wardrobes`);
    console.log(`Created ${products.length} products`);

    // Show room-wardrobe associations
    console.log('\n📋 Room-Wardrobe Associations:');
    for (const room of rooms) {
      const roomWardrobes = wardrobes.filter(w => w.roomId.toString() === room._id.toString());
      console.log(`\n🏠 ${room.name}:`);
      roomWardrobes.forEach(w => {
        console.log(`  👗 ${w.name} (${w.occasionType})`);
      });
    }

  } catch (error) {
    console.error('❌ Error reseeding database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the reseeding function
reseedDatabase();







