import { ThemedView } from '@/components/themed-view';
import { catalogAPI } from '@/services/catalogApi';
import { Wardrobe, wardrobeApi, WardrobeItem } from '@/services/wardrobeApi';
import { getDefaultImageProps, getProductImageUri } from '@/utils/imageUtils';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    ImageBackground,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/auth-context';

// Use WardrobeItem type from API directly for items

const { width: screenWidth } = Dimensions.get('window');

interface OutfitItem {
  id: string;
  name: string;
  brand: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  image: string;
  category: string;
  isSelected: boolean;
  isMainItem?: boolean;
}

interface OutfitSuggestion {
  id: string;
  name: string;
  occasion: string;
  description: string;
  mainItem: OutfitItem;
  accessories: OutfitItem[];
  totalPrice: number;
  originalTotalPrice: number;
  totalDiscount: number;
  confidence: number;
}

interface AIRecommendation {
  id: string;
  name: string;
  brand: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  image: string;
  category: string;
  subcategory?: string;
  rating?: number;
  reviewCount?: number;
  isNew?: boolean;
  isTrending?: boolean;
  discountPercentage?: number;
  matchScore: number;
  reason: string;
  productId: string;
}

// Mock data for outfit suggestions
const mockOutfitSuggestions: OutfitSuggestion[] = [
  {
    id: '1',
    name: 'Elegant Evening Look',
    occasion: 'Formal Event',
    description: 'Perfect for a sophisticated evening out',
    mainItem: {
      id: '1',
      name: 'Black Evening Dress',
      brand: 'Zara',
      price: 2999,
      originalPrice: 3999,
      discount: 25,
      image: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400&h=500&fit=crop',
      category: 'Dresses',
      isSelected: true,
      isMainItem: true
    },
    accessories: [
      {
        id: '2',
        name: 'Pearl Earrings',
        brand: 'H&M',
        price: 899,
        image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=400&h=500&fit=crop',
        category: 'Jewelry',
        isSelected: false
      },
      {
        id: '3',
        name: 'Black Heels',
        brand: 'Mango',
        price: 2499,
        image: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400&h=500&fit=crop',
        category: 'Shoes',
        isSelected: false
      }
    ],
    totalPrice: 6397,
    originalTotalPrice: 7397,
    totalDiscount: 1000,
    confidence: 95
  },
  {
    id: '2',
    name: 'Casual Weekend Look',
    occasion: 'Casual',
    description: 'Comfortable and stylish for weekend activities',
    mainItem: {
      id: '4',
      name: 'Denim Jacket',
      brand: 'Levi\'s',
      price: 1999,
      image: 'https://images.unsplash.com/photo-1544022613-e87ca75a784a?w=400&h=500&fit=crop',
      category: 'Jackets',
      isSelected: true,
      isMainItem: true
    },
    accessories: [
      {
        id: '5',
        name: 'White T-Shirt',
        brand: 'Uniqlo',
        price: 599,
        image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400&h=500&fit=crop',
        category: 'Tops',
        isSelected: false
      },
      {
        id: '6',
        name: 'Sneakers',
        brand: 'Nike',
        price: 3999,
        image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&h=500&fit=crop',
        category: 'Shoes',
        isSelected: false
      }
    ],
    totalPrice: 6597,
    originalTotalPrice: 6597,
    totalDiscount: 0,
    confidence: 88
  }
];


export default function WardrobeDetailScreen() {
    const { id } = useLocalSearchParams();
    const { user } = useAuth();
    const [wardrobe, setWardrobe] = useState<Wardrobe | null>(null);
    const [items, setItems] = useState<WardrobeItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'liked'>('all');
  const [loading, setLoading] = useState(true);
  const [likedItems, setLikedItems] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'items' | 'ai-outfits'>('items');
  const [aiRecommendations, setAiRecommendations] = useState<{[key: string]: AIRecommendation[]}>({});
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);

    useEffect(() => {
        loadWardrobeData();
    }, [id]);

    useEffect(() => {
        if (items.length > 0) {
            generateAllAIRecommendations();
        }
    }, [items]);

    const loadWardrobeData = async () => {
        try {
            setLoading(true);
            const token = await AsyncStorage.getItem('auth_token');
            if (!token) {
                Alert.alert('Error', 'Please log in to view wardrobe details');
                return;
            }

            // Load wardrobe details
            const wardrobeResponse = await wardrobeApi.getWardrobeById(token, id as string);
            if (wardrobeResponse.status === 'success' && wardrobeResponse.data) {
                setWardrobe(wardrobeResponse.data.wardrobe);
            }

            // Load wardrobe items
            const itemsResponse = await wardrobeApi.getWardrobeItems(token, id as string, { limit: 100 });
            if (itemsResponse.status === 'success' && itemsResponse.data) {
                setItems(itemsResponse.data.items);
                
                // Initialize liked states based on current user
                if (user) {
                    const likedSet = new Set<string>();
                    
                    itemsResponse.data.items.forEach(item => {
                        // Check if current user has liked this item
                        if (item.reactions && Array.isArray(item.reactions)) {
                            const userLiked = item.reactions.some(r => r.userId === user._id && (r.type === 'like' || r.type === 'love'));
                            if (userLiked) {
                                likedSet.add(item._id);
                            }
                        }
                    });
                    
                    setLikedItems(likedSet);
                }
            }


        } catch (error) {
            console.error('Error loading wardrobe data:', error);
            Alert.alert('Error', 'Failed to load wardrobe details');
        } finally {
            setLoading(false);
        }
    };


    const getLikeCount = (it: WardrobeItem): number => {
        const reactions = Array.isArray(it.reactions) ? it.reactions : [];
        const baseCount = reactions.reduce((acc, r) => acc + ((r.type === 'like' || r.type === 'love') ? 1 : 0), 0);
        // Add 1 if current user has liked it locally
        return likedItems.has(it._id) ? baseCount + 1 : baseCount;
    };

    const getUpdatedLikeCount = (itemId: string): number => {
        const item = items.find(i => i._id === itemId);
        if (!item) return 0;
        
        const reactions = Array.isArray(item.reactions) ? item.reactions : [];
        const baseCount = reactions.reduce((acc, r) => acc + ((r.type === 'like' || r.type === 'love') ? 1 : 0), 0);
        // Add 1 if current user has liked it locally
        return likedItems.has(itemId) ? baseCount + 1 : baseCount;
    };

    const handleLike = async (itemId: string) => {
        if (!user) return;
        
        try {
            const isCurrentlyLiked = likedItems.has(itemId);
            
            if (isCurrentlyLiked) {
                // Unlike - just update local state for now
                setLikedItems(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(itemId);
                    return newSet;
                });
            } else {
                // Like - just update local state for now
                setLikedItems(prev => new Set(prev).add(itemId));
            }
        } catch (error) {
            console.error('Error toggling like:', error);
        }
    };

    // AI Recommendation Algorithm - Generate for all items
    const generateAllAIRecommendations = async () => {
        if (items.length === 0) {
            console.log('No wardrobe items available for recommendations');
            return;
        }
        
        console.log('Generating AI recommendations for', items.length, 'wardrobe items');
        
        setIsLoadingRecommendations(true);
        
        try {
            // Get all products from catalog
            const catalogResponse = await catalogAPI.getProducts({
                limit: 50,
                sortBy: 'rating',
                sortOrder: 'desc'
            });
            
            console.log('Catalog API Response:', catalogResponse);
            
            // Handle different response structures
            let allProducts = [];
            if (Array.isArray(catalogResponse)) {
                allProducts = catalogResponse;
            } else if (catalogResponse && Array.isArray(catalogResponse.products)) {
                allProducts = catalogResponse.products;
            } else if (catalogResponse && Array.isArray(catalogResponse.data)) {
                allProducts = catalogResponse.data;
            } else {
                console.warn('Unexpected API response structure:', catalogResponse);
                // If no products available, return empty array to show proper empty state
                allProducts = [];
            }
            
            // Generate recommendations for each wardrobe item
            const allRecommendations: {[key: string]: AIRecommendation[]} = {};
            
            if (allProducts.length === 0) {
                console.log('No products available for recommendations');
                setAiRecommendations({});
                return;
            }
            
            console.log('Available products for recommendations:', allProducts.length);
            
            for (const item of items) {
                console.log('Processing wardrobe item:', item.productId?.name);
                
                // Get 3 random products from catalog (excluding the current wardrobe item)
                const availableProducts = allProducts.filter((product: any) => 
                    product._id !== item.productId?._id && product.id !== item.productId?._id
                );
                
                console.log('Available products for item:', availableProducts.length);
                
                let recommendations = [];
                
                if (availableProducts.length > 0) {
                    recommendations = availableProducts
                        .map((product: any) => {
                            // Give all products a random match score between 0.6-0.9 for variety
                            const matchScore = 0.6 + Math.random() * 0.3;
                            return {
                                id: product._id || product.id,
                                productId: product._id || product.id,
                                name: product.name || 'Unknown Product',
                                brand: product.brand || 'Unknown Brand',
                                price: product.price || 0,
                                originalPrice: product.originalPrice || product.mrp,
                                discount: product.discount || 0,
                                discountPercentage: product.discountPercentage || 0,
                                image: product.image || product.images?.[0] || product.imageUrl || '',
                                category: product.category || 'Unknown',
                                subcategory: product.subcategory,
                                rating: product.rating || 0,
                                reviewCount: product.reviewCount || product.reviews?.length || 0,
                                isNew: product.isNew || false,
                                isTrending: product.isTrending || false,
                                matchScore,
                                reason: 'Great addition to your wardrobe'
                            };
                        })
                        .sort((a: AIRecommendation, b: AIRecommendation) => b.matchScore - a.matchScore)
                        .slice(0, 3);
                } else {
                    // If no products available, create some fallback recommendations
                    recommendations = [
                        {
                            id: `fallback-${item._id}-1`,
                            productId: `fallback-${item._id}-1`,
                            name: 'Sample Product 1',
                            brand: 'Sample Brand',
                            price: 1999,
                            originalPrice: 2499,
                            discount: 20,
                            discountPercentage: 20,
                            image: 'https://via.placeholder.com/200x200/f0f0f0/999999?text=Sample+1',
                            category: 'Sample',
                            rating: 4.2,
                            reviewCount: 50,
                            isNew: true,
                            isTrending: false,
                            matchScore: 0.85,
                            reason: 'Great addition to your wardrobe'
                        },
                        {
                            id: `fallback-${item._id}-2`,
                            productId: `fallback-${item._id}-2`,
                            name: 'Sample Product 2',
                            brand: 'Sample Brand',
                            price: 1499,
                            originalPrice: 1999,
                            discount: 25,
                            discountPercentage: 25,
                            image: 'https://via.placeholder.com/200x200/f0f0f0/999999?text=Sample+2',
                            category: 'Sample',
                            rating: 4.5,
                            reviewCount: 75,
                            isNew: false,
                            isTrending: true,
                            matchScore: 0.78,
                            reason: 'Perfect for your style'
                        },
                        {
                            id: `fallback-${item._id}-3`,
                            productId: `fallback-${item._id}-3`,
                            name: 'Sample Product 3',
                            brand: 'Sample Brand',
                            price: 2999,
                            originalPrice: 3999,
                            discount: 25,
                            discountPercentage: 25,
                            image: 'https://via.placeholder.com/200x200/f0f0f0/999999?text=Sample+3',
                            category: 'Sample',
                            rating: 4.8,
                            reviewCount: 100,
                            isNew: true,
                            isTrending: true,
                            matchScore: 0.72,
                            reason: 'Trending item you\'ll love'
                        }
                    ];
                }
                
                console.log('Generated recommendations for item:', recommendations.length);
                allRecommendations[item._id] = recommendations;
            }
            
            console.log('Generated recommendations for all items:', Object.keys(allRecommendations).length);
            setAiRecommendations(allRecommendations);
        } catch (error) {
            console.error('Error generating AI recommendations:', error);
            // Set empty recommendations to show proper empty state
            setAiRecommendations({});
            Alert.alert('Error', 'Unable to load product recommendations. Please check your connection and try again.');
        } finally {
            setIsLoadingRecommendations(false);
        }
    };

    const calculateMatchScore = (wardrobeItem: WardrobeItem, product: any): number => {
        let score = 0;
        const wardrobeCategory = wardrobeItem.productId?.category?.toLowerCase() || '';
        const productCategory = product.category?.toLowerCase() || '';
        const wardrobeBrand = wardrobeItem.productId?.brand?.toLowerCase() || '';
        const productBrand = product.brand?.toLowerCase() || '';
        
        // Category compatibility scoring
        const categoryCompatibility = getCategoryCompatibility(wardrobeCategory, productCategory);
        score += categoryCompatibility * 0.4;
        
        // Brand matching (prefer different brands for variety)
        if (wardrobeBrand && productBrand && wardrobeBrand !== productBrand) {
            score += 0.2; // Bonus for different brands
        } else if (wardrobeBrand && productBrand && wardrobeBrand === productBrand) {
            score += 0.1; // Small bonus for same brand
        }
        
        // Price range compatibility
        const wardrobePrice = wardrobeItem.productId?.price || 0;
        const productPrice = product.price || 0;
        const priceRatio = Math.min(wardrobePrice, productPrice) / Math.max(wardrobePrice, productPrice);
        if (priceRatio > 0.5) { // Similar price ranges
            score += 0.2;
        }
        
        // Rating bonus
        const rating = product.rating || 0;
        if (rating >= 4.0) {
            score += 0.1;
        } else if (rating >= 3.5) {
            score += 0.05;
        }
        
        // Trending/New bonus
        if (product.isTrending) score += 0.05;
        if (product.isNew) score += 0.05;
        
        return Math.min(score, 1.0); // Cap at 1.0
    };

    const getCategoryCompatibility = (wardrobeCategory: string, productCategory: string): number => {
        // Define category compatibility matrix
        const compatibilityMatrix: { [key: string]: string[] } = {
            'tops': ['bottoms', 'shoes', 'accessories', 'bags'],
            'bottoms': ['tops', 'shoes', 'accessories', 'bags'],
            'dresses': ['shoes', 'accessories', 'bags', 'jackets'],
            'shoes': ['tops', 'bottoms', 'dresses', 'accessories'],
            'accessories': ['tops', 'bottoms', 'dresses', 'bags'],
            'bags': ['tops', 'bottoms', 'dresses', 'accessories'],
            'jackets': ['tops', 'bottoms', 'dresses', 'accessories'],
            'jeans': ['tops', 'shoes', 'accessories', 'bags'],
            'shirts': ['bottoms', 'shoes', 'accessories', 'bags'],
            'skirts': ['tops', 'shoes', 'accessories', 'bags'],
            'pants': ['tops', 'shoes', 'accessories', 'bags']
        };
        
        const compatibleCategories = compatibilityMatrix[wardrobeCategory] || [];
        if (compatibleCategories.includes(productCategory)) {
            return 1.0; // Perfect match
        }
        
        // Check for partial matches
        for (const compatible of compatibleCategories) {
            if (productCategory.includes(compatible) || compatible.includes(productCategory)) {
                return 0.7; // Partial match
            }
        }
        
        return 0.3; // Low compatibility
    };

    const generateMatchReason = (wardrobeItem: WardrobeItem, product: any, matchScore: number): string => {
        const reasons = [
            'Great addition to your wardrobe',
            'Perfect for your style',
            'Trending item you\'ll love',
            'Excellent choice for you',
            'Must-have fashion piece',
            'Stylish and versatile',
            'Perfect wardrobe essential',
            'Fashion-forward pick'
        ];
        
        // Return a random reason for variety
        return reasons[Math.floor(Math.random() * reasons.length)];
    };

    const handleRecommendationPress = (recommendation: AIRecommendation) => {
        router.push(`/product/${recommendation.productId}`);
    };

    const filteredAndSortedItems = useMemo(() => {
        const withCounts = items.map(it => ({
            ...it,
            __likeCount: getLikeCount(it),
        }));
        if (filter === 'liked') {
            return [...withCounts].sort((a, b) => (b as any).__likeCount - (a as any).__likeCount);
        }
        return withCounts;
    }, [items, filter, likedItems]);

    const renderWardrobeItem = ({ item }: { item: WardrobeItem & { __likeCount?: number; __buyCount?: number } }) => {
        // Handle null productId
        if (!item.productId) {
            return (
                <TouchableOpacity 
                    style={styles.itemCard}
                    onPress={() => {
                        // Don't navigate if no product
                    }}
                >
                    <View style={styles.itemImageContainer}>
                        <Image 
                            source={{ uri: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=500&fit=crop' }} 
                            style={styles.itemImage}
                            resizeMode="cover"
                        />
                    </View>
                    
                    <View style={styles.itemDetails}>
                        <Text style={styles.itemName} numberOfLines={2}>
                            Product Not Available
                        </Text>
                        <Text style={styles.itemBrand}>Unknown Brand</Text>
                        <Text style={styles.itemPrice}>₹0</Text>
                        <Text style={styles.itemCategory}>Unknown Category</Text>
                    </View>

                </TouchableOpacity>
            );
        }

        return (
                <TouchableOpacity 
                style={styles.itemCard}
                onPress={() => router.push(`/product/${item.productId._id}?fromWardrobeId=${id}`)}
            >
                <View style={styles.itemImageContainer}>
                    <Image 
                        source={{ uri: getProductImageUri(item.productId) }} 
                        style={styles.itemImage}
                        resizeMode="cover"
                        {...getDefaultImageProps()}
                    />
                    <View style={styles.badgeRow}>
                        {item.productId && (
                            <>
                                {(item.productId as any)?.isNew && (
                                    <View style={styles.newBadge}>
                                        <Text style={styles.newBadgeText}>NEW</Text>
                                    </View>
                                )}
                                {(item.productId as any)?.isTrending && (
                                    <View style={styles.trendingBadge}>
                                        <Text style={styles.trendingBadgeText}>🔥</Text>
                                    </View>
                                )}
                                {typeof (item.productId as any)?.discountPercentage === 'number' && (item.productId as any).discountPercentage > 0 && (
                                    <View style={styles.discountBadge}>
                                        <Text style={styles.discountBadgeText}>{(item.productId as any).discountPercentage}% OFF</Text>
                                    </View>
                                )}
                            </>
                        )}
                    </View>
                    
                    {/* Heart button in top right corner */}
                    <View style={styles.heartButtonContainer}>
                        <TouchableOpacity 
                            style={[styles.heartButton, likedItems.has(item._id) && styles.heartButtonActive]}
                            onPress={() => handleLike(item._id)}
                        >
                            <Ionicons 
                                name={likedItems.has(item._id) ? "heart" : "heart-outline"} 
                                size={16} 
                                color={likedItems.has(item._id) ? "#fff" : "#333"} 
                            />
                            <Text style={[styles.heartCount, likedItems.has(item._id) && styles.heartCountActive]}>
                                {getUpdatedLikeCount(item._id)}
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.ratingOverlay}>
                        <Text style={styles.ratingOverlayText}>
                            ⭐ {(item.productId as any)?.rating && typeof (item.productId as any).rating === 'number' ? (item.productId as any).rating.toFixed(1) : '4.2'} ({(item.productId as any)?.reviewCount || 150})
                        </Text>
                    </View>
                </View>
                
                <View style={styles.itemDetails}>
                    <Text style={styles.itemBrand}>{item.productId?.brand || 'Brand'}</Text>
                    <Text style={styles.itemName} numberOfLines={2}>
                        {item.productId?.name || 'Unknown Product'}
                    </Text>
                    <View style={styles.priceRow}>
                        {(item.productId as any)?.originalPrice && item.productId?.price && 
                         typeof (item.productId as any).originalPrice === 'number' && typeof item.productId.price === 'number' &&
                         (item.productId as any).originalPrice > item.productId.price ? (
                            <>
                                <Text style={styles.originalPrice}>₹{(item.productId as any).originalPrice.toLocaleString()}</Text>
                                <Text style={styles.discountText}>({(item.productId as any).discountPercentage || 0}% off)</Text>
                                <Text style={styles.itemPrice}>₹{item.productId.price.toLocaleString()}</Text>
                            </>
                        ) : (
                            <Text style={styles.itemPrice}>₹{(typeof item.productId?.price === 'number' ? item.productId.price : 0).toLocaleString()}</Text>
                        )}
                    </View>
                    
                    {/* MRP and Discount Info */}
                    {(item.productId as any)?.originalPrice && item.productId?.price && 
                     typeof (item.productId as any).originalPrice === 'number' && typeof item.productId.price === 'number' &&
                     (item.productId as any).originalPrice > item.productId.price && (
                        <View style={styles.mrpRow}>
                            <Text style={styles.mrpLabel}>MRP: </Text>
                            <Text style={styles.mrpPrice}>₹{(item.productId as any).originalPrice.toLocaleString()}</Text>
                            <Text style={styles.savingsText}>You save ₹{((item.productId as any).originalPrice - item.productId.price).toLocaleString()}</Text>
                        </View>
                    )}
                    
                </View>

            </TouchableOpacity>
        );
    };


    if (loading) {
        return (
            <ThemedView style={styles.container}>
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#ff6b6b" />
                        <Text style={styles.loadingText}>Loading wardrobe...</Text>
                    </View>
                </SafeAreaView>
            </ThemedView>
        );
    }

    if (!wardrobe) {
        return (
            <ThemedView style={styles.container}>
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>Wardrobe not found</Text>
                        <TouchableOpacity 
                            style={styles.backButton}
                            onPress={() => router.back()}
                        >
                            <Text style={styles.backButtonText}>Go Back</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </ThemedView>
        );
    }

    return (
        <ThemedView style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButtonContainer}>
                        <Text style={styles.backIcon}>‹</Text>
                    </TouchableOpacity>
                    
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>{wardrobe.name}</Text>
                        <Text style={styles.headerSubtitle}>{wardrobe.occasionType}</Text>
                    </View>
                    
                    <TouchableOpacity 
                        style={styles.menuButton}
                        onPress={() => router.push(`/wardrobe/access?wardrobeId=${id}`)}
                    >
                        <Text style={styles.menuButtonText}>⋯</Text>
                    </TouchableOpacity>
                </View>

                {/* Wardrobe Info (trimmed) */}
                {!!wardrobe.description && (
                    <View style={styles.wardrobeInfo}>
                        <Text style={styles.wardrobeDescription}>{wardrobe.description}</Text>
                    </View>
                )}

                {/* Tabs */}
                <View style={styles.tabContainer}>
                    <TouchableOpacity 
                        style={[styles.tab, activeTab === 'items' && styles.activeTab]}
                        onPress={() => setActiveTab('items')}
                    >
                        <Text style={[styles.tabText, activeTab === 'items' && styles.activeTabText]}>Items</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.tab, activeTab === 'ai-outfits' && styles.activeTab]}
                        onPress={() => setActiveTab('ai-outfits')}
                    >
                        <Text style={[styles.tabText, activeTab === 'ai-outfits' && styles.activeTabText]}>AI Outfits</Text>
                    </TouchableOpacity>
                </View>

                {/* Filter Pills - Only show for Items tab */}
                {activeTab === 'items' && (
                    <View style={styles.filterRow}>
                        <TouchableOpacity
                            style={[styles.filterPill, filter === 'all' && styles.filterPillActive]}
                            onPress={() => setFilter('all')}
                        >
                            <Text style={[styles.filterPillText, filter === 'all' && styles.filterPillTextActive]}>All</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.filterPill, filter === 'liked' && styles.filterPillActive]}
                            onPress={() => setFilter('liked')}
                        >
                            <Text style={[styles.filterPillText, filter === 'liked' && styles.filterPillTextActive]}>Most liked</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Content */}
                {activeTab === 'items' ? (
                    <FlatList
                        data={filteredAndSortedItems as any}
                        renderItem={renderWardrobeItem}
                        keyExtractor={(item) => item._id}
                        numColumns={2}
                        contentContainerStyle={styles.itemsGrid}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <ImageBackground
                                source={{ uri: 'https://cdn.dribbble.com/userupload/20573048/file/original-4f00702d51457e3021f9aa9ac53c92c8.gif' }}
                                style={styles.emptyStateBg}
                                imageStyle={styles.emptyStateBgImage}
                            >
                                <View style={styles.emptyStateOverlay}>
                                    <Text style={styles.emptyStateText}>No outfits yet</Text>
                                </View>
                            </ImageBackground>
                        }
                    />
                ) : (
                    <ScrollView style={styles.aiOutfitsContainer} showsVerticalScrollIndicator={false}>
                        {isLoadingRecommendations ? (
                            <View style={styles.aiLoadingContainer}>
                                <ActivityIndicator size="large" color="#E91E63" />
                                <Text style={styles.aiLoadingText}>Creating AI outfit combinations...</Text>
                            </View>
                        ) : Object.keys(aiRecommendations).length > 0 ? (
                            <View style={styles.outfitCardsContainer}>
                                {items.map((item) => (
                                    <View key={item._id} style={styles.aiOutfitCard}>
                                        {/* Main Item Header */}
                                        <View style={styles.mainItemHeader}>
                                            <View style={styles.mainItemImageContainer}>
                                            <Image 
                                                source={{ 
                                                    uri: item.productId?.image || 'https://via.placeholder.com/200x200/f0f0f0/999999?text=No+Image' 
                                                }} 
                                                style={styles.mainItemImage}
                                                resizeMode="cover"
                                            />
                                            </View>
                                            <View style={styles.mainItemInfo}>
                                                <Text style={styles.mainItemBrand}>{item.productId?.brand || 'Unknown Brand'}</Text>
                                                <Text style={styles.mainItemName} numberOfLines={2}>
                                                    {item.productId?.name || 'Unknown Product'}
                                                </Text>
                                                <Text style={styles.mainItemCategory}>{item.productId?.category}</Text>
                                                <Text style={styles.mainItemPrice}>
                                                    ₹{(item.productId?.price || 0).toLocaleString()}
                                                </Text>
                                            </View>
                                        </View>
                                        
                                        {/* AI Recommendations */}
                                        <View style={styles.recommendationsSection}>
                                            <Text style={styles.recommendationsTitle}>AI Pairs</Text>
                                            <View style={styles.recommendationsRow}>
                                                {aiRecommendations[item._id]?.map((recommendation, index) => (
                                                    <TouchableOpacity 
                                                        key={recommendation.id} 
                                                        style={styles.recommendationItem}
                                                        onPress={() => handleRecommendationPress(recommendation)}
                                                    >
                                                        <View style={styles.outfitRecommendationImageContainer}>
                                                            <Image 
                                                                source={{ 
                                                                    uri: recommendation.image || 'https://via.placeholder.com/200x200/f0f0f0/999999?text=No+Image' 
                                                                }} 
                                                                style={styles.outfitRecommendationImage}
                                                                resizeMode="cover"
                                                                onError={() => console.log('Image failed to load for:', recommendation.name)}
                                                            />
                                                            <View style={styles.outfitMatchScoreBadge}>
                                                                <Text style={styles.outfitMatchScoreText}>
                                                                    {Math.round(recommendation.matchScore * 100)}%
                                                                </Text>
                                                            </View>
                                                        </View>
                                                        
                                                        <View style={styles.outfitRecommendationContent}>
                                                            <Text style={styles.outfitRecommendationBrand}>{recommendation.brand}</Text>
                                                            <Text style={styles.outfitRecommendationName} numberOfLines={2}>
                                                                {recommendation.name}
                                                            </Text>
                                                            <Text style={styles.outfitRecommendationPrice}>
                                                                ₹{recommendation.price.toLocaleString()}
                                                            </Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <View style={styles.noRecommendationsContainer}>
                                <Ionicons name="sparkles-outline" size={48} color="#ccc" />
                                <Text style={styles.noRecommendationsTitle}>No Wardrobe Items</Text>
                                <Text style={styles.noRecommendationsText}>
                                    Add items to your wardrobe from the Items tab to see AI outfit recommendations
                                </Text>
                            </View>
                        )}
                    </ScrollView>
                )}
            </SafeAreaView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    safeArea: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#666',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    errorText: {
        fontSize: 18,
        color: '#666',
        marginBottom: 20,
    },
    backButton: {
        backgroundColor: '#ff6b6b',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
    },
    backButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    backButtonContainer: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backIcon: {
        fontSize: 24,
        color: '#333',
        fontWeight: '300',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    menuButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuButtonText: {
        fontSize: 20,
        color: '#333',
    },
    wardrobeInfo: {
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 8,
        marginBottom: 8,
    },
    wardrobeDescription: {
        fontSize: 12,
        color: '#666',
        lineHeight: 18,
    },
    wardrobeStats: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    statItem: {
        alignItems: 'center',
    },
    statNumber: {
        fontSize: 20,
        fontWeight: '600',
        color: '#333',
    },
    statLabel: {
        fontSize: 12,
        color: '#666',
        marginTop: 4,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: '#ff6b6b',
    },
    tabText: {
        fontSize: 12,
        color: '#666',
        fontWeight: '500',
    },
    activeTabText: {
        color: '#ff6b6b',
        fontWeight: '600',
    },
    itemsGrid: {
        paddingHorizontal: 8,
        paddingVertical: 8,
        flexGrow: 1,
    },
    filterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingTop: 8,
    },
    filterPill: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 18,
        backgroundColor: '#f5f5f5',
        borderWidth: 1,
        borderColor: '#e6e6e6',
    },
    filterPillActive: {
        backgroundColor: '#FFF5F8',
        borderColor: '#FFB6CF',
    },
    filterPillText: {
        fontSize: 12,
        color: '#9aa0a6',
        fontWeight: '600',
    },
    filterPillTextActive: {
        color: '#E91E63',
    },
    emptyStateBg: {
        width: '100%',
        flex: 1,
        minHeight: 300,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        borderRadius: 8,
    },
    emptyStateBgImage: {
        resizeMode: 'cover',
        opacity: 0.18,
    },
    emptyStateOverlay: {
        flex: 1,
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    emptyStateText: {
        fontSize: 12,
        color: '#999',
        fontStyle: 'italic',
        textAlign: 'center',
    },
    itemCard: {
        width: '48%',
        backgroundColor: '#fff',
        borderRadius: 8,
        margin: '1%',
        padding: 0,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 1,
        },
        shadowOpacity: 0.06,
        shadowRadius: 2,
        elevation: 1,
        borderWidth: 1,
        borderColor: '#f0f0f0',
    },
    itemImageContainer: {
        height: 150,
        borderRadius: 8,
        overflow: 'hidden',
    },
    badgeRow: {
        position: 'absolute',
        top: 8,
        left: 8,
        right: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    newBadge: {
        backgroundColor: '#4CAF50',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    newBadgeText: {
        fontSize: 10,
        color: 'white',
        fontWeight: 'bold',
    },
    trendingBadge: {
        backgroundColor: '#FF5722',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    trendingBadgeText: {
        fontSize: 10,
        color: 'white',
    },
    discountBadge: {
        backgroundColor: '#E91E63',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    discountBadgeText: {
        fontSize: 10,
        color: 'white',
        fontWeight: 'bold',
    },
    ratingOverlay: {
        position: 'absolute',
        bottom: 8,
        left: 8,
    },
    ratingOverlayText: {
        fontSize: 10,
        color: 'white',
        fontWeight: '600',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: 4,
    },
    heartButtonContainer: {
        position: 'absolute',
        top: 8,
        right: 8,
    },
    heartButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderWidth: 1,
        borderColor: '#333',
        paddingHorizontal: 6,
        paddingVertical: 4,
        borderRadius: 12,
        minWidth: 32,
        justifyContent: 'center',
        gap: 3,
    },
    heartButtonActive: {
        backgroundColor: '#E91E63',
        borderColor: '#E91E63',
    },
    heartCount: {
        fontSize: 9,
        color: '#666',
        fontWeight: '500',
    },
    heartCountActive: {
        color: '#fff',
    },
    itemImage: {
        width: '100%',
        height: '100%',
    },
    itemImagePlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: '#f0f0f0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemImagePlaceholderText: {
        fontSize: 24,
        fontWeight: '600',
        color: '#999',
    },
    itemDetails: {
        flex: 1,
        paddingHorizontal: 8,
        paddingVertical: 8,
    },
    itemName: {
        fontSize: 10,
        fontWeight: '600',
        color: '#1a1a1a',
        marginBottom: 2,
        lineHeight: 13,
    },
    itemBrand: {
        fontSize: 8,
        color: '#999',
        marginBottom: 4,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    itemPrice: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#1a1a1a',
        marginRight: 6,
    },
    itemCategory: {
        fontSize: 9,
        color: '#999',
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: -2,
        flexWrap: 'wrap',
    },
    originalPrice: {
        fontSize: 8,
        color: '#999',
        textDecorationLine: 'line-through',
        marginRight: 4,
    },
    discountText: {
        fontSize: 8,
        color: '#E91E63',
        fontWeight: '600',
        marginRight: 4,
    },
    mrpRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
        flexWrap: 'wrap',
    },
    mrpLabel: {
        fontSize: 8,
        color: '#666',
        fontWeight: '500',
    },
    mrpPrice: {
        fontSize: 8,
        color: '#999',
        textDecorationLine: 'line-through',
        marginRight: 6,
    },
    savingsText: {
        fontSize: 8,
        color: '#4CAF50',
        fontWeight: '600',
    },
    // AI Outfits Styles
    aiOutfitsContainer: {
        flex: 1,
        paddingHorizontal: 16,
    },
    outfitCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        marginBottom: 16,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    outfitHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    outfitTitleContainer: {
        flex: 1,
    },
    outfitName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    outfitOccasion: {
        fontSize: 12,
        color: '#666',
        marginBottom: 4,
    },
    outfitDescription: {
        fontSize: 11,
        color: '#999',
        lineHeight: 16,
    },
    confidenceBadge: {
        backgroundColor: '#E91E63',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    confidenceText: {
        fontSize: 10,
        color: '#fff',
        fontWeight: '600',
    },
    outfitItemsContainer: {
        marginBottom: 16,
    },
    outfitItem: {
        width: 120,
        marginRight: 12,
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
        overflow: 'hidden',
    },
    outfitItemImage: {
        width: '100%',
        height: 120,
        resizeMode: 'cover',
    },
    outfitItemInfo: {
        padding: 8,
    },
    outfitItemBrand: {
        fontSize: 9,
        color: '#666',
        fontWeight: '500',
        marginBottom: 2,
    },
    outfitItemName: {
        fontSize: 10,
        color: '#333',
        fontWeight: '500',
        marginBottom: 4,
        lineHeight: 12,
    },
    outfitItemPrice: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    outfitPrice: {
        fontSize: 11,
        color: '#333',
        fontWeight: '600',
    },
    outfitOriginalPrice: {
        fontSize: 9,
        color: '#999',
        textDecorationLine: 'line-through',
        marginRight: 4,
    },
    outfitFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    totalPriceContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    totalPriceLabel: {
        fontSize: 12,
        color: '#666',
        fontWeight: '500',
    },
    totalPrice: {
        fontSize: 14,
        color: '#333',
        fontWeight: '600',
        marginRight: 8,
    },
    totalOriginalPrice: {
        fontSize: 12,
        color: '#999',
        textDecorationLine: 'line-through',
        marginRight: 4,
    },
    
    // AI Recommendation Button
    aiRecommendButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8F9FA',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 16,
        marginTop: 8,
        borderWidth: 1,
        borderColor: '#E91E63',
    },
    aiRecommendText: {
        fontSize: 12,
        color: '#E91E63',
        fontWeight: '600',
        marginLeft: 4,
    },
    
    // AI Recommendations
    selectedItemHeader: {
        backgroundColor: '#F8F9FA',
        padding: 16,
        marginBottom: 16,
        borderRadius: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#E91E63',
    },
    selectedItemTitle: {
        fontSize: 14,
        color: '#666',
        marginBottom: 4,
    },
    selectedItemName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 2,
    },
    selectedItemCategory: {
        fontSize: 12,
        color: '#E91E63',
        textTransform: 'uppercase',
        fontWeight: '500',
    },
    
    aiLoadingContainer: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    aiLoadingText: {
        marginTop: 12,
        fontSize: 14,
        color: '#666',
    },
    
    recommendationsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
    },
    recommendationCard: {
        width: '48%',
        backgroundColor: '#fff',
        borderRadius: 12,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    recommendationImageContainer: {
        position: 'relative',
        height: 120,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        overflow: 'hidden',
    },
    recommendationImage: {
        width: '100%',
        height: '100%',
    },
    matchScoreBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(233, 30, 99, 0.9)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    matchScoreText: {
        fontSize: 8,
        color: '#fff',
        fontWeight: '600',
    },
    recommendationContent: {
        padding: 8,
    },
    recommendationBrand: {
        fontSize: 8,
        color: '#666',
        textTransform: 'uppercase',
        fontWeight: '500',
        marginBottom: 2,
    },
    recommendationName: {
        fontSize: 11,
        fontWeight: '600',
        color: '#333',
        marginBottom: 3,
        lineHeight: 14,
    },
    recommendationReason: {
        fontSize: 9,
        color: '#E91E63',
        marginBottom: 6,
        fontStyle: 'italic',
    },
    recommendationPriceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 4,
    },
    recommendationPrice: {
        fontSize: 12,
        fontWeight: '700',
        color: '#333',
        marginRight: 4,
    },
    recommendationOriginalPrice: {
        fontSize: 9,
        color: '#999',
        textDecorationLine: 'line-through',
        marginRight: 3,
    },
    recommendationDiscount: {
        fontSize: 8,
        color: '#E91E63',
        fontWeight: '600',
    },
    recommendationRating: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    recommendationRatingText: {
        fontSize: 8,
        color: '#666',
        marginLeft: 2,
    },
    
    noRecommendationsContainer: {
        alignItems: 'center',
        paddingVertical: 60,
        paddingHorizontal: 40,
    },
    noRecommendationsTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginTop: 16,
        marginBottom: 8,
    },
    noRecommendationsText: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        lineHeight: 20,
    },
    
    // New Elegant Outfit Cards
    outfitCardsContainer: {
        padding: 8,
    },
    aiOutfitCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
        overflow: 'hidden',
    },
    mainItemHeader: {
        flexDirection: 'row',
        padding: 16,
        backgroundColor: '#F8F9FA',
        borderBottomWidth: 1,
        borderBottomColor: '#E9ECEF',
    },
    mainItemImageContainer: {
        width: 80,
        height: 80,
        borderRadius: 12,
        overflow: 'hidden',
        marginRight: 16,
    },
    mainItemImage: {
        width: '100%',
        height: '100%',
    },
    mainItemInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    mainItemBrand: {
        fontSize: 12,
        color: '#666',
        textTransform: 'uppercase',
        fontWeight: '500',
        marginBottom: 4,
    },
    mainItemName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
        lineHeight: 20,
    },
    mainItemCategory: {
        fontSize: 12,
        color: '#E91E63',
        textTransform: 'uppercase',
        fontWeight: '500',
        marginBottom: 4,
    },
    mainItemPrice: {
        fontSize: 16,
        fontWeight: '700',
        color: '#333',
    },
    recommendationsSection: {
        padding: 16,
    },
    recommendationsTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginBottom: 12,
    },
    recommendationsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    recommendationItem: {
        flex: 1,
        marginHorizontal: 2,
        backgroundColor: '#F8F9FA',
        borderRadius: 12,
        overflow: 'hidden',
    },
    outfitRecommendationImageContainer: {
        position: 'relative',
        height: 100,
    },
    outfitRecommendationImage: {
        width: '100%',
        height: '100%',
    },
    outfitMatchScoreBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(76, 175, 80, 0.9)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
    },
    outfitMatchScoreText: {
        fontSize: 10,
        color: '#fff',
        fontWeight: '600',
    },
    outfitRecommendationContent: {
        padding: 8,
    },
    outfitRecommendationBrand: {
        fontSize: 8,
        color: '#666',
        textTransform: 'uppercase',
        fontWeight: '500',
        marginBottom: 2,
    },
    outfitRecommendationName: {
        fontSize: 10,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
        lineHeight: 12,
    },
    outfitRecommendationPrice: {
        fontSize: 11,
        fontWeight: '700',
        color: '#333',
    },
});