const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Room = require('../models/Room');
const Wardrobe = require('../models/Wardrobe');
const WardrobeItem = require('../models/WardrobeItem');
const Product = require('../models/Product');
require('dotenv').config();

// Sample users
const sampleUsers = [
  {
    name: 'Priya Sharma',
    email: 'priya@example.com',
    password: 'password123',
    profileImage: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face'
  },
  {
    name: 'Richa Patel',
    email: 'richa@example.com',
    password: 'password123',
    profileImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face'
  },
  {
    name: 'Neyati Singh',
    email: 'neyati@example.com',
    password: 'password123',
    profileImage: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face'
  }
];

// Detailed rooms with specific themes
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

// Detailed wardrobes for each room
const roomWardrobes = {
  'Fashion Forward': [
    {
      name: 'Trendy Streetwear',
      emoji: '👟',
      description: 'Urban street style collection for the fashion-forward',
      occasionType: 'Casual & Weekend',
      budgetRange: { min: 800, max: 5000 },
      isPrivate: false,
      settings: {
        allowMemberInvites: true,
        aiSuggestionsEnabled: true,
        autoOutfitGeneration: false
      },
      tags: ['streetwear', 'urban', 'trendy']
    },
    {
      name: 'Designer Handbags',
      emoji: '👜',
      description: 'Luxury handbag collection for every occasion',
      occasionType: 'General Collection',
      budgetRange: { min: 2000, max: 15000 },
      isPrivate: false,
      settings: {
        allowMemberInvites: true,
        aiSuggestionsEnabled: true,
        autoOutfitGeneration: false
      },
      tags: ['handbags', 'luxury', 'designer']
    }
  ],
  'Wedding Collection': [
    {
      name: 'Bridal Lehengas',
      emoji: '👰',
      description: 'Stunning bridal lehengas for special occasions',
      occasionType: 'Wedding & Celebrations',
      budgetRange: { min: 15000, max: 100000 },
      isPrivate: false,
      settings: {
        allowMemberInvites: true,
        aiSuggestionsEnabled: true,
        autoOutfitGeneration: true
      },
      tags: ['bridal', 'lehenga', 'wedding']
    },
    {
      name: 'Traditional Jewelry',
      emoji: '💎',
      description: 'Exquisite traditional jewelry collection',
      occasionType: 'Wedding & Celebrations',
      budgetRange: { min: 5000, max: 50000 },
      isPrivate: false,
      settings: {
        allowMemberInvites: true,
        aiSuggestionsEnabled: true,
        autoOutfitGeneration: true
      },
      tags: ['jewelry', 'traditional', 'gold']
    }
  ],
  'Casual Vibes': [
    {
      name: 'Comfortable Denim',
      emoji: '👖',
      description: 'Perfect denim collection for everyday wear',
      occasionType: 'Casual & Weekend',
      budgetRange: { min: 500, max: 3000 },
      isPrivate: false,
      settings: {
        allowMemberInvites: true,
        aiSuggestionsEnabled: true,
        autoOutfitGeneration: false
      },
      tags: ['denim', 'casual', 'comfortable']
    },
    {
      name: 'Cozy Sweaters',
      emoji: '🧥',
      description: 'Warm and cozy sweater collection',
      occasionType: 'Casual & Weekend',
      budgetRange: { min: 800, max: 4000 },
      isPrivate: false,
      settings: {
        allowMemberInvites: true,
        aiSuggestionsEnabled: true,
        autoOutfitGeneration: false
      },
      tags: ['sweaters', 'cozy', 'warm']
    }
  ],
  'Office Professional': [
    {
      name: 'Power Suits',
      emoji: '👔',
      description: 'Professional suits for business meetings',
      occasionType: 'Office & Professional',
      budgetRange: { min: 3000, max: 20000 },
      isPrivate: true,
      settings: {
        allowMemberInvites: true,
        aiSuggestionsEnabled: true,
        autoOutfitGeneration: false
      },
      tags: ['suits', 'professional', 'business']
    },
    {
      name: 'Formal Accessories',
      emoji: '⌚',
      description: 'Elegant accessories for professional look',
      occasionType: 'Office & Professional',
      budgetRange: { min: 1000, max: 10000 },
      isPrivate: true,
      settings: {
        allowMemberInvites: true,
        aiSuggestionsEnabled: true,
        autoOutfitGeneration: false
      },
      tags: ['accessories', 'formal', 'professional']
    }
  ]
};

// Detailed products for each wardrobe
const wardrobeProducts = {
  'Trendy Streetwear': [
    {
      name: 'Oversized Graphic Hoodie',
      price: 2500,
      images: [
        { url: 'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=500&fit=crop' }
      ],
      brand: 'Nike',
      category: 'Clothing',
      subcategory: 'Hoodies',
      description: 'Comfortable oversized hoodie with trendy graphic print',
      isActive: true,
      inStock: true,
      rating: 4.3,
      reviewCount: 89
    },
    {
      name: 'High-Waist Distressed Jeans',
      price: 3200,
      images: [
        { url: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400&h=500&fit=crop' }
      ],
      brand: 'Levi\'s',
      category: 'Clothing',
      subcategory: 'Jeans',
      description: 'Trendy high-waist jeans with distressed details',
      isActive: true,
      inStock: true,
      rating: 4.5,
      reviewCount: 156
    },
    {
      name: 'Chunky White Sneakers',
      price: 4500,
      images: [
        { url: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1594736797933-d0401ba2fe65?w=400&h=500&fit=crop' }
      ],
      brand: 'Adidas',
      category: 'Footwear',
      subcategory: 'Sneakers',
      description: 'Chunky white sneakers perfect for street style',
      isActive: true,
      inStock: true,
      rating: 4.7,
      reviewCount: 203
    }
  ],
  'Designer Handbags': [
    {
      name: 'Leather Crossbody Bag',
      price: 8500,
      images: [
        { url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?w=400&h=500&fit=crop' }
      ],
      brand: 'Coach',
      category: 'Bags',
      subcategory: 'Crossbody',
      description: 'Luxury leather crossbody bag with gold hardware',
      isActive: true,
      inStock: true,
      rating: 4.8,
      reviewCount: 127
    },
    {
      name: 'Designer Tote Bag',
      price: 12000,
      images: [
        { url: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=500&fit=crop' }
      ],
      brand: 'Michael Kors',
      category: 'Bags',
      subcategory: 'Tote',
      description: 'Spacious designer tote bag for everyday use',
      isActive: true,
      inStock: true,
      rating: 4.6,
      reviewCount: 94
    }
  ],
  'Bridal Lehengas': [
    {
      name: 'Red Silk Lehenga with Zari Work',
      price: 45000,
      images: [
        { url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400&h=500&fit=crop' }
      ],
      brand: 'Sabyasachi',
      category: 'Clothing',
      subcategory: 'Lehenga',
      description: 'Exquisite red silk lehenga with intricate zari embroidery',
      isActive: true,
      inStock: true,
      rating: 4.9,
      reviewCount: 45
    },
    {
      name: 'Pink Organza Lehenga',
      price: 38000,
      images: [
        { url: 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=500&fit=crop' }
      ],
      brand: 'Manish Malhotra',
      category: 'Clothing',
      subcategory: 'Lehenga',
      description: 'Elegant pink organza lehenga with sequin work',
      isActive: true,
      inStock: true,
      rating: 4.8,
      reviewCount: 67
    },
    {
      name: 'Gold Embroidered Dupatta',
      price: 8500,
      images: [
        { url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=500&fit=crop' }
      ],
      brand: 'Anita Dongre',
      category: 'Accessories',
      subcategory: 'Dupatta',
      description: 'Luxurious gold embroidered dupatta for bridal wear',
      isActive: true,
      inStock: true,
      rating: 4.7,
      reviewCount: 23
    }
  ],
  'Traditional Jewelry': [
    {
      name: 'Gold Temple Necklace Set',
      price: 25000,
      images: [
        { url: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400&h=500&fit=crop' }
      ],
      brand: 'Tanishq',
      category: 'Jewelry',
      subcategory: 'Necklace',
      description: 'Traditional gold temple necklace with matching earrings',
      isActive: true,
      inStock: true,
      rating: 4.9,
      reviewCount: 78
    },
    {
      name: 'Pearl Choker Set',
      price: 15000,
      images: [
        { url: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400&h=500&fit=crop' }
      ],
      brand: 'Kalyan Jewellers',
      category: 'Jewelry',
      subcategory: 'Choker',
      description: 'Elegant pearl choker with diamond accents',
      isActive: true,
      inStock: true,
      rating: 4.6,
      reviewCount: 56
    }
  ],
  'Comfortable Denim': [
    {
      name: 'High-Waist Skinny Jeans',
      price: 1800,
      images: [
        { url: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400&h=500&fit=crop' }
      ],
      brand: 'H&M',
      category: 'Clothing',
      subcategory: 'Jeans',
      description: 'Comfortable high-waist skinny jeans in classic blue',
      isActive: true,
      inStock: true,
      rating: 4.2,
      reviewCount: 134
    },
    {
      name: 'Distressed Boyfriend Jeans',
      price: 2200,
      images: [
        { url: 'https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400&h=500&fit=crop' }
      ],
      brand: 'Zara',
      category: 'Clothing',
      subcategory: 'Jeans',
      description: 'Relaxed fit boyfriend jeans with distressed details',
      isActive: true,
      inStock: true,
      rating: 4.4,
      reviewCount: 89
    },
    {
      name: 'Denim Jacket',
      price: 3500,
      images: [
        { url: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=400&h=500&fit=crop' }
      ],
      brand: 'Levi\'s',
      category: 'Clothing',
      subcategory: 'Jacket',
      description: 'Classic denim jacket perfect for layering',
      isActive: true,
      inStock: true,
      rating: 4.5,
      reviewCount: 167
    }
  ],
  'Cozy Sweaters': [
    {
      name: 'Cable Knit Sweater',
      price: 2800,
      images: [
        { url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400&h=500&fit=crop' }
      ],
      brand: 'Uniqlo',
      category: 'Clothing',
      subcategory: 'Sweater',
      description: 'Warm cable knit sweater in neutral beige',
      isActive: true,
      inStock: true,
      rating: 4.3,
      reviewCount: 98
    },
    {
      name: 'Oversized Cardigan',
      price: 3200,
      images: [
        { url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400&h=500&fit=crop' }
      ],
      brand: 'COS',
      category: 'Clothing',
      subcategory: 'Cardigan',
      description: 'Oversized cardigan perfect for cozy days',
      isActive: true,
      inStock: true,
      rating: 4.6,
      reviewCount: 76
    }
  ],
  'Power Suits': [
    {
      name: 'Navy Blue Blazer Set',
      price: 12000,
      images: [
        { url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=500&fit=crop' }
      ],
      brand: 'Hugo Boss',
      category: 'Clothing',
      subcategory: 'Suit',
      description: 'Professional navy blue blazer with matching trousers',
      isActive: true,
      inStock: true,
      rating: 4.7,
      reviewCount: 45
    },
    {
      name: 'Black Pencil Skirt Set',
      price: 8500,
      images: [
        { url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400&h=500&fit=crop' }
      ],
      brand: 'Zara',
      category: 'Clothing',
      subcategory: 'Suit',
      description: 'Elegant black pencil skirt with matching blazer',
      isActive: true,
      inStock: true,
      rating: 4.4,
      reviewCount: 67
    }
  ],
  'Formal Accessories': [
    {
      name: 'Leather Briefcase',
      price: 6500,
      images: [
        { url: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1594223274512-ad4803739b7c?w=400&h=500&fit=crop' }
      ],
      brand: 'Samsonite',
      category: 'Bags',
      subcategory: 'Briefcase',
      description: 'Professional leather briefcase for business meetings',
      isActive: true,
      inStock: true,
      rating: 4.5,
      reviewCount: 89
    },
    {
      name: 'Classic Watch',
      price: 8500,
      images: [
        { url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=500&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400&h=500&fit=crop' }
      ],
      brand: 'Fossil',
      category: 'Accessories',
      subcategory: 'Watch',
      description: 'Elegant classic watch for professional attire',
      isActive: true,
      inStock: true,
      rating: 4.6,
      reviewCount: 123
    }
  ]
};

async function createDetailedWardrobes() {
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

    // Create users with real password hashes
    const users = [];
    for (const userData of sampleUsers) {
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      const user = new User({
        ...userData,
        password: hashedPassword
      });
      await user.save();
      users.push(user);
      console.log(`👤 Created user: ${user.name} (${user.email})`);
    }

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
      console.log(`🏠 Created room: ${room.name}`);
    }

    // Create wardrobes and products for each room
    const allWardrobes = [];
    const allProducts = [];

    for (const room of rooms) {
      const roomWardrobeData = roomWardrobes[room.name] || [];
      
      for (let i = 0; i < roomWardrobeData.length; i++) {
        const wardrobeData = roomWardrobeData[i];
        const owner = users[i % users.length];
        
        const wardrobe = new Wardrobe({
          ...wardrobeData,
          owner: owner._id,
          roomId: room._id,
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
        allWardrobes.push(wardrobe);
        console.log(`👗 Created wardrobe: ${wardrobe.name} in room: ${room.name}`);

        // Create products for this wardrobe
        const wardrobeProductData = wardrobeProducts[wardrobe.name] || [];
        for (const productData of wardrobeProductData) {
          const product = new Product(productData);
          await product.save();
          allProducts.push(product);
          console.log(`  🛍️ Created product: ${product.name} (₹${product.price})`);

          // Add product to wardrobe
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
    }

    // Update wardrobe item counts
    for (const wardrobe of allWardrobes) {
      const itemCount = await WardrobeItem.countDocuments({ wardrobeId: wardrobe._id });
      wardrobe.itemCount = itemCount;
      await wardrobe.save();
    }

    // Update room member counts
    for (const room of rooms) {
      room.memberCount = room.members.length;
      await room.save();
    }

    console.log('\n🎉 Detailed wardrobe creation completed successfully!');
    console.log(`Created ${users.length} users`);
    console.log(`Created ${rooms.length} rooms`);
    console.log(`Created ${allWardrobes.length} wardrobes`);
    console.log(`Created ${allProducts.length} products`);

    console.log('\n🔑 LOGIN CREDENTIALS:');
    console.log('Email: priya@example.com | Password: password123');
    console.log('Email: richa@example.com | Password: password123');
    console.log('Email: neyati@example.com | Password: password123');

    console.log('\n📋 Detailed Room-Wardrobe-Product Associations:');
    for (const room of rooms) {
      const roomWardrobes = allWardrobes.filter(w => w.roomId.toString() === room._id.toString());
      console.log(`\n🏠 ${room.name}:`);
      for (const wardrobe of roomWardrobes) {
        const wardrobeItems = await WardrobeItem.find({ wardrobeId: wardrobe._id }).populate('productId');
        console.log(`  👗 ${wardrobe.name} (${wardrobe.occasionType}) - ${wardrobeItems.length} items:`);
        for (const item of wardrobeItems) {
          console.log(`    🛍️ ${item.productId.name} - ₹${item.productId.price}`);
        }
      }
    }

  } catch (error) {
    console.error('❌ Error creating detailed wardrobes:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the detailed creation function
createDetailedWardrobes();







