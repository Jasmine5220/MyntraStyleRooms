import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    AppState,
    Dimensions,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RoomSelectionModal from '../components/RoomSelectionModal';
import HostSessionHeader from '../components/session/HostSessionHeader';
import LiveBrowsePanel from '../components/session/LiveBrowsePanel';
import SessionBottomControls from '../components/session/SessionBottomControls';
import { useAuth } from '../contexts/auth-context';
import { useSession } from '../contexts/session-context';
import { Category } from '../data/categories';
import { PlayMenuItem } from '../data/playMenuItems';
import { useActiveBanners } from '../hooks/useBanners';
import { useActiveCategories } from '../hooks/useCategories';
import { useActivePlayMenuItems } from '../hooks/usePlayMenu';
import {
    Product,
    useProducts,
    useProductSearch,
    useTrendingProducts
} from '../hooks/useProducts';
import messageStorage from '../services/messageStorage';
import socketService from '../services/socketService';

const { width: screenWidth } = Dimensions.get('window');

// Note: Data will be fetched using hooks inside the component


export default function CatalogScreen() {
  const { isInSession, isHost, sessionParticipants, presenterName, isMuted, toggleMute, endSession, sessionRoomId, setParticipantProduct, setParticipants, selectedWardrobeId } = useSession();
  const { user } = useAuth();
  
  // Debug session state
  console.log('🔍 Catalog screen session state:', { 
    isInSession, 
    isHost, 
    participantsCount: sessionParticipants.length, 
    sessionRoomId,
    presenterName 
  });
  // Update session context from browse updates to feed LiveBrowsePanel
  React.useEffect(() => {
    if (!isInSession || !sessionRoomId || !user) return;

    // Join user room for follow notifications
    socketService.joinUser(user._id);

    // Don't clear browse view immediately when entering catalog
    // This allows the LiveBrowsePanel to show the last product the user was viewing
    console.log('📱 User entered catalog - keeping last viewed product in LiveBrowsePanel');

    socketService.updateCallbacks({
      onBrowseUpdate: (data) => {
        if (!data?.userId) return;
        if (data.productId) {
          setParticipantProduct(data.userId, { id: data.productId, name: data.productTitle, image: data.productImage });
        } else {
          setParticipantProduct(data.userId, null);
        }
      },
      onSessionParticipants: (participants) => {
        if (!Array.isArray(participants)) return;
        const normalizedRaw = participants.map((p: any) => {
          const isCurrent = user && p.userId === user._id;
          const displayName = isCurrent ? user!.name : (p.userName || p.name);
          const fallbackAvatarName = displayName && typeof displayName === 'string' ? displayName : 'User';
          const avatar = isCurrent
            ? (user!.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(user!.name)}&background=4A90E2&color=FFFFFF&size=150`)
            : (p.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackAvatarName)}&background=4A90E2&color=FFFFFF&size=150`);
          return {
            id: p.userId,
            name: displayName,
            avatar,
            isMuted: false,
            currentProduct: p.currentProduct ? {
              id: p.currentProduct.productId,
              name: p.currentProduct.productTitle,
              image: p.currentProduct.productImage,
            } : null,
          };
        });
        // Dedupe by id
        const seen = new Set<string>();
        const normalized = normalizedRaw.filter((p: any) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
        setParticipants(normalized);
      },
      onFollowNavigate: (data) => {
        // Auto navigate to product if following
        console.log('🧭 Follow navigation triggered:', data);
        if (data?.productId) {
          router.push(`/product/${data.productId}` as any);
        }
      },
    });

    // Cleanup: don't clear browse view when component unmounts
    // This preserves the last viewed product in the LiveBrowsePanel
    return () => {
      if (isInSession && sessionRoomId && user) {
        console.log('📱 User left catalog - keeping last viewed product in LiveBrowsePanel');
      }
    };
  }, [isInSession, sessionRoomId, user, setParticipantProduct]);

  // Leave/cleanup helper
  const handleEndAndCleanup = React.useCallback(() => {
    try {
      if (sessionRoomId && user) {
        socketService.leaveSession(sessionRoomId, user._id);
        socketService.leaveRoom(sessionRoomId);
        if (isHost) {
          socketService.endSession(sessionRoomId);
        }
      }
    } finally {
      endSession();
    }
  }, [sessionRoomId, user, isHost, endSession]);

  // Wardrobe navigation handler
  const handleWardrobePress = React.useCallback(() => {
    if (selectedWardrobeId) {
      console.log('👔 Opening wardrobe:', selectedWardrobeId);
      router.push(`/wardrobe/${selectedWardrobeId}`);
    } else {
      console.log('⚠️ No wardrobe selected for this session');
      // Navigate to wardrobe selection if no wardrobe is linked
      router.push('/wardrobes');
    }
  }, [selectedWardrobeId]);

  // Note: Do not auto-cleanup on unmount to avoid navigation race loops.

  // Cleanup when app goes to background
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' && isInSession) {
        handleEndAndCleanup();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [isInSession, handleEndAndCleanup]);
  const { logout } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState('1');
  const [showExploreMenu, setShowExploreMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const bannerScrollRef = useRef<ScrollView>(null);
  const [showPlayMenu, setShowPlayMenu] = useState(false);
  
  // Fetch data from backend using hooks
  const { banners, loading: bannersLoading } = useActiveBanners();
  const { categories, loading: categoriesLoading } = useActiveCategories();
  const { items: playMenuItems, loading: playMenuLoading } = useActivePlayMenuItems();
  const productFilters = useMemo(() => ({
    category: selectedCategory === '1' ? undefined : categories.find(cat => cat._id === selectedCategory)?.name
  }), [selectedCategory, categories]);
  const { products, loading: productsLoading } = useProducts(productFilters);
  const { products: trendingProducts, loading: trendingLoading } = useTrendingProducts(8);
  const { products: searchResults, loading: searchLoading } = useProductSearch(searchQuery);
  
  const playButtonScale = useRef(new Animated.Value(1)).current;
  const menuOpacity = useRef(new Animated.Value(0)).current;
  const menuScale = useRef(new Animated.Value(0.8)).current;
  const [showRoomSelection, setShowRoomSelection] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Auto-scroll banner every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBannerIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % banners.length;
        bannerScrollRef.current?.scrollTo({
          x: nextIndex * screenWidth,
          animated: true,
        });
        return nextIndex;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);


  // Animate play button and menu
  useEffect(() => {
    if (showPlayMenu) {
      // Animate button scale and color change
      Animated.parallel([
        Animated.spring(playButtonScale, {
          toValue: 1.1,
          useNativeDriver: true,
        }),
        Animated.timing(menuOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(menuScale, {
          toValue: 1,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animate button back to normal
      Animated.parallel([
        Animated.spring(playButtonScale, {
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(menuOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(menuScale, {
          toValue: 0.8,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showPlayMenu]);

  // Determine which products to display
  const displayProducts = searchQuery ? searchResults : products;
  const isLoading = searchQuery ? searchLoading : productsLoading;

  // Handle logout
  const handleLogout = async () => {
    try {
      // Call the logout function (it will clear the token)
      await logout();
      
      // Force navigation to login screen
      router.replace('/auth/login');
      
    } catch (error) {
      console.error('Logout error:', error);
      
      // Even if there's an error, try to clear the token and redirect
      try {
        await AsyncStorage.removeItem('auth_token');
        router.replace('/auth/login');
      } catch (clearError) {
        console.error('Emergency logout failed:', clearError);
      }
    }
  };

  // Send to Chat moved to Product Detail screen

  // Handle room selection for sending product
  const handleRoomSelect = async (room: any) => {
    if (!selectedProduct) return;

    try {
      // Create product message with unique ID
      const productMessage = {
        id: `product_${selectedProduct._id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: `Check out this ${selectedProduct.name}!`,
        sender: 'user' as 'user' | 'friend' | 'ai' | 'maya',
        senderName: 'You',
        senderAvatar: 'https://ui-avatars.com/api/?name=You&background=FF6B9D&color=FFFFFF&size=150',
        timestamp: new Date().toISOString(),
        isProduct: true,
        productData: {
          name: selectedProduct.name,
          price: `₹${selectedProduct.price.toLocaleString()}`,
          image: selectedProduct.image,
          description: selectedProduct.description || `${selectedProduct.brand} ${selectedProduct.name}`,
          brand: selectedProduct.brand,
          category: selectedProduct.category,
          rating: selectedProduct.rating,
          discountPercentage: selectedProduct.discountPercentage,
          originalPrice: selectedProduct.originalPrice ? `₹${selectedProduct.originalPrice.toLocaleString()}` : undefined,
        },
        reactions: {
          thumbsUp: 0,
          thumbsDown: 0,
        }
      };

      // Save message to storage
      await messageStorage.addMessage(room._id, productMessage);

      // Send via Socket.IO if connected
      const connectionStatus = socketService.getConnectionStatus();
      if (connectionStatus.isConnected) {
        socketService.sendMessage({
          text: productMessage.text,
          sender: 'user',
          senderName: 'You',
          senderAvatar: 'https://ui-avatars.com/api/?name=You&background=FF6B9D&color=FFFFFF&size=150',
          roomId: room._id,
          messageType: 'product',
          productData: productMessage.productData,
          reactions: productMessage.reactions
        });
      }

      console.log(`✅ Product "${selectedProduct.name}" sent to room "${room.name}"`);
      
      // Navigate to the room chat
      router.push(`/room/${room._id}`);
      
    } catch (error) {
      console.error('❌ Error sending product to chat:', error);
    }
  };

  const renderCategory = ({ item }: { item: Category }) => (
    <TouchableOpacity
      style={[
        styles.categoryItem,
        item.isActive && styles.selectedCategory
      ]}
      onPress={() => setSelectedCategory(item._id)}
    >
      <View style={[
        styles.categoryIcon, 
        item.isActive && styles.activeCategoryIcon
      ]}>
        <Image source={{ uri: item.icon }} style={styles.categoryIconImage} contentFit="cover" />
      </View>
      <Text style={[
        styles.categoryName,
        item.isActive && styles.selectedCategoryName
      ]}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  const renderProduct = ({ item }: { item: Product }) => (
    <View style={styles.productCard}>
      <TouchableOpacity 
        style={styles.productCardInner}
        onPress={() => router.push(`/product/${item._id}` as any)}
      >
        <View style={styles.productImageContainer}>
          <Image source={{ uri: item.image }} style={styles.productImage} />
          {item.isNew && (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>NEW</Text>
            </View>
          )}
          {item.isTrending && (
            <View style={styles.trendingBadge}>
              <Text style={styles.trendingBadgeText}>🔥</Text>
            </View>
          )}
          {item.discountPercentage > 0 && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountBadgeText}>{item.discountPercentage}% OFF</Text>
            </View>
          )}
          <View style={styles.ratingOverlay}>
            <Text style={styles.ratingOverlayText}>⭐ {item.rating ? item.rating.toFixed(1) : (Math.random() * 2 + 3).toFixed(1)} ({item.reviewCount || Math.floor(Math.random() * 200 + 50)})</Text>
          </View>
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.brandName} numberOfLines={1}>{item.brand}</Text>
          <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
          <View style={styles.priceContainer}>
            {item.originalPrice > item.price ? (
              <>
                <Text style={styles.originalPrice}>₹{item.originalPrice.toLocaleString()}</Text>
                <Text style={styles.discountText}>({item.discountPercentage}% off)</Text>
                <Text style={styles.price}>₹{item.price.toLocaleString()}</Text>
              </>
            ) : (
              <Text style={styles.price}>₹{item.price.toLocaleString()}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
      
      {/* Send to Chat moved to Product Detail screen */}
    </View>
  );


  // Show loading state if any critical data is loading
  if (bannersLoading || categoriesLoading || productsLoading) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.container}>
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading catalog...</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.container}>
        {/* Session Header Components - unified */}
        {isInSession && (
          <HostSessionHeader
            participants={sessionParticipants}
            presenterName={presenterName}
            onNotificationPress={() => {}}
            onLikePress={() => {}}
            onParticipantsPress={() => {}}
          />
        )}

        {isInSession && (
          <LiveBrowsePanel 
            currentUserId={user?._id} 
            onFollowUser={(userId) => {}} 
          />
        )}
        
        <ScrollView 
          style={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header with Search Bar */}
          <View style={styles.header}>
            <View style={styles.searchBar}>
              <Image source={require('@/assets/images/icon.webp')} style={styles.searchBarLogo} contentFit="contain" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search 'Joggers'"
                placeholderTextColor="#999"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <Ionicons name="search" size={18} color="#999" />
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity style={styles.headerButton}>
                <Ionicons name="notifications-outline" size={20} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerButton}>
                <Ionicons name="heart-outline" size={20} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.headerButton}
                onPress={() => router.push('/profile')}
              >
                <Ionicons name="person-outline" size={20} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.headerButton}
                onPress={handleLogout}
              >
                <Ionicons name="log-out-outline" size={20} color="#E91E63" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Main Category Tabs */}
          <View style={styles.mainCategoryTabs}>
            <TouchableOpacity style={styles.mainCategoryTab}>
              <Text style={[styles.mainCategoryText, styles.activeMainCategoryText]}>All</Text>
              <View style={styles.activeUnderline} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.mainCategoryTab}>
              <Text style={styles.mainCategoryText}>Men</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mainCategoryTab}>
              <Text style={styles.mainCategoryText}>Women</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mainCategoryTab}>
              <Text style={styles.mainCategoryText}>Kids</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mainCategoryTab}>
              <Ionicons name="grid-outline" size={20} color="#000" />
            </TouchableOpacity>
          </View>

          {/* Categories */}
          <View style={styles.categoriesContainer}>
            <FlatList
              data={categories}
              renderItem={renderCategory}
              keyExtractor={item => item._id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoriesList}
            />
          </View>


          {/* Promotional Banner 1 - GST Savings */}
          <View style={styles.promoBanner1}>
            <View style={styles.promoBanner1Left}>
              <View style={styles.promoBanner1Logo}>
                <Text style={styles.promoBanner1LogoText}>Big Fashion Festival</Text>
              </View>
            </View>
            <View style={styles.promoBanner1Center}>
              <Text style={styles.promoBanner1Title}>GET YOUR GST SAVINGS AHEAD OF TIME</Text>
            </View>
            <View style={styles.promoBanner1Right}>
              <Text style={styles.promoBanner1Date}>SALE STARTS SEP 20</Text>
              <TouchableOpacity style={styles.promoBanner1Button}>
                <Text style={styles.promoBanner1ButtonText}>Wishlist Now</Text>
                <Ionicons name="arrow-forward" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Banner Carousel */}
          <View style={styles.bannerCarousel}>
            <ScrollView
              ref={bannerScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const index = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
                setCurrentBannerIndex(index);
              }}
            >
              {banners.map((banner, index) => (
                <View key={banner._id} style={styles.bannerSlide}>
                  <View style={styles.bannerImageContainer}>
                    <Image 
                      source={{ uri: banner.image }} 
                      style={styles.bannerImage}
                      contentFit="cover"
                    />
                    <View style={styles.bannerOverlay}>
                      <View style={styles.bannerTextLeft}>
                        <Text style={styles.bannerTitle}>{banner.title}</Text>
                        <Text style={styles.bannerDiscount}>{banner.discount}</Text>
                      </View>
                      <View style={styles.bannerTextCenter}>
                        <Text style={styles.bannerBrand}>{banner.brand}</Text>
                      </View>
                      <View style={styles.bannerTextRight}>
                        <TouchableOpacity style={styles.bannerButton}>
                          <Text style={styles.bannerButtonText}>{banner.buttonText}</Text>
                          <Ionicons name="arrow-forward" size={16} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.adLabel}>
                      <Text style={styles.adLabelText}>AD</Text>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Carousel Indicators */}
          <View style={styles.carouselIndicators}>
            {banners.map((_, index) => (
              <View 
                key={index} 
                style={[
                  styles.indicator, 
                  index === currentBannerIndex && styles.activeIndicator
                ]} 
              />
            ))}
          </View>

          {/* Sponsor Logos */}
          <View style={styles.sponsorSection}>
            <View style={styles.sponsorItem}>
              <Text style={styles.sponsorText}>ASSOCIATE SPONSOR U.S. POLO ASSN. SINCE 1890</Text>
              <Ionicons name="chevron-forward" size={16} color="#000" />
            </View>
            <View style={styles.sponsorDivider} />
            <View style={styles.sponsorItem}>
              <Text style={styles.sponsorText}>TITLE SPONSOR PUMA</Text>
              <Ionicons name="chevron-forward" size={16} color="#000" />
            </View>
            <View style={styles.sponsorDivider} />
            <View style={styles.sponsorItem}>
              <Text style={styles.sponsorText}>ASSOCIATE SPONSOR JACK&JONES</Text>
              <Ionicons name="chevron-forward" size={16} color="#000" />
            </View>
          </View>

          {/* Cashback Banner */}
          <View style={styles.cashbackBanner}>
            <Image 
              source={{ uri: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=100&h=60&fit=crop' }} 
              style={styles.cashbackCardImage} 
            />
            <View style={styles.cashbackTextContainer}>
              <Text style={styles.cashbackTitle}>Flat 7.5% Cashback*</Text>
              <Text style={styles.cashbackSubtitle}>On FLIPKART AXIS BANK Credit Card</Text>
            </View>
          </View>

          {/* Trending Section - use same card UI as main catalog */}
          <View style={styles.mockCardsSection}>
            <Text style={styles.mockCardsTitle}>Trending Now</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mockCardsContainer}
            >
              {trendingProducts.map((item) => (
                <View key={item._id} style={{ marginRight: 6, width: 220 }}>
                  {renderProduct({ item } as any)}
                </View>
              ))}
            </ScrollView>
          </View>

          {/* Recommendations For You Section */}
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionTitle}>Recommendations For You</Text>
          </View>

          {/* Products Grid */}
          <View style={styles.productsContainer}>
            <FlatList
              data={displayProducts}
              renderItem={renderProduct}
              keyExtractor={item => item._id}
              numColumns={2}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.productsList}
              scrollEnabled={false}
              columnWrapperStyle={styles.row}
            />
          </View>
        </ScrollView>

        {/* Fixed Play Button */}
        <Animated.View style={[styles.playButton, { transform: [{ scale: playButtonScale }] }]}>
          <TouchableOpacity 
            style={[styles.playButtonInner, showPlayMenu && styles.playButtonActive]}
            onPress={() => setShowPlayMenu(!showPlayMenu)}
          >
            <Ionicons 
              name={showPlayMenu ? "close" : "play"} 
              size={20} 
              color="#fff" 
            />
          </TouchableOpacity>
        </Animated.View>

        {/* Bottom Navigation */}
        <View style={styles.bottomNavigation}>
          <TouchableOpacity style={styles.bottomTab}>
            <Image source={require('@/assets/Catalog/myntra-removebg-preview.png')} style={styles.bottomTabIcon} contentFit="contain" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.bottomTab}>
            <Text style={styles.bottomTabText}>fwd</Text>
            <Text style={styles.bottomTabSubtext}>Under ₹999</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.bottomTab}>
            <Text style={styles.bottomTabText}>LUXE</Text>
            <Text style={styles.bottomTabSubtext}>Luxury</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.bottomTab}>
            <Ionicons name="bag-outline" size={20} color="#000" />
            <Text style={styles.bottomTabText}>Bag</Text>
          </TouchableOpacity>
        </View>

        {/* Explore Menu Modal */}
        <Modal
          visible={showExploreMenu}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowExploreMenu(false)}
        >
          <TouchableOpacity 
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowExploreMenu(false)}
          >
            <View style={styles.exploreMenu}>
              <View style={styles.menuHeader}>
                <Text style={styles.menuTitle}>Explore</Text>
                <TouchableOpacity onPress={() => setShowExploreMenu(false)}>
                  <Ionicons name="close" size={24} color="#000" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.menuItems}>
                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => {
                    setShowExploreMenu(false);
                    router.push('/(tabs)');
                  }}
                >
                  <View style={styles.menuItemIcon}>
                    <Ionicons name="home" size={24} color="#E91E63" />
                  </View>
                  <Text style={styles.menuItemText}>Home</Text>
                </TouchableOpacity>

                 <TouchableOpacity 
                   style={styles.menuItem}
                   onPress={() => {
                     setShowExploreMenu(false);
                    //  router.push('/(tabs)/explore');
                   }}
                 >
                   <View style={styles.menuItemIcon}>
                     <Image source={require('@/assets/Catalog/fwd_icon-removebg-preview.png')} style={styles.menuIconImage} contentFit="contain" />
                   </View>
                   <Text style={styles.menuItemText}>Explore</Text>
                 </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => {
                    setShowExploreMenu(false);
                    router.push('/(tabs)');
                  }}
                >
                  <View style={styles.menuItemIcon}>
                    <Ionicons name="people" size={24} color="#E91E63" />
                  </View>
                  <Text style={styles.menuItemText}>Fashion Rooms</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => {
                    setShowExploreMenu(false);
                    // router.push('/(tabs)/wardrobes');
                  }}
                >
                  <View style={styles.menuItemIcon}>
                    <Ionicons name="shirt" size={24} color="#E91E63" />
                  </View>
                  <Text style={styles.menuItemText}>Wardrobes</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => {
                    setShowExploreMenu(false);
                    router.push('/(tabs)/profile');
                  }}
                >
                  <View style={styles.menuItemIcon}>
                    <Ionicons name="person" size={24} color="#E91E63" />
                  </View>
                  <Text style={styles.menuItemText}>Profile</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => {
                    setShowExploreMenu(false);
                    router.push('/maya-demo');
                  }}
                >
                  <View style={styles.menuItemIcon}>
                    <Ionicons name="chatbubble" size={24} color="#8B5CF6" />
                  </View>
                  <Text style={styles.menuItemText}>Maya AI Demo</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Room Selection Modal */}
        <RoomSelectionModal
          visible={showRoomSelection}
          onClose={() => setShowRoomSelection(false)}
          onRoomSelect={handleRoomSelect}
          productName={selectedProduct?.name}
        />

        {/* Play Menu Modal */}
        <Modal
          visible={showPlayMenu}
          transparent={true}
          animationType="none"
          onRequestClose={() => setShowPlayMenu(false)}
        >
          <TouchableOpacity 
            style={styles.playMenuOverlay}
            activeOpacity={1}
            onPress={() => setShowPlayMenu(false)}
          >
            <Animated.View style={[styles.playMenuContainer, { 
              opacity: menuOpacity, 
              transform: [{ scale: menuScale }] 
            }]}>
              <View style={styles.playMenuList}>
                {playMenuItems.map((item: PlayMenuItem) => (
                  <TouchableOpacity 
                    key={item._id} 
                    style={styles.playMenuItem}
                    onPress={() => {
                      if (item._id === '1') {
                        // Navigate to fashion rooms screen
                        router.push('/(tabs)');
                        setShowPlayMenu(false);
                      }
                    }}
                  >
                    <View style={styles.playMenuItemLeft}>
                      <View style={styles.playMenuIconContainer}>
                        <Image source={{ uri: item.icon }} style={styles.playMenuIcon} contentFit="cover" />
                      </View>
                      <View style={styles.playMenuItemText}>
                        <Text style={styles.playMenuItemTitle}>{item.title}</Text>
                        <Text style={styles.playMenuItemDescription}>{item.description}</Text>
                      </View>
                    </View>
                    <View style={styles.playMenuItemRight}>
                      {item.hasNewTag && (
                        <View style={[
                          styles.playMenuNewTag,
                          item._id === '1' && styles.playMenuNewTagGlow
                        ]}>
                          <Text style={styles.playMenuNewTagText}>New</Text>
                        </View>
                      )}
                      <Ionicons name="chevron-forward" size={20} color="#999" />
                    </View>
                  </TouchableOpacity>
                ))}
                
                <TouchableOpacity style={styles.playMenuExploreItem}>
                  <Text style={styles.playMenuExploreTitle}>Explore more Features</Text>
                  <Ionicons name="chevron-forward" size={20} color="#999" />
                </TouchableOpacity>
              </View>
            </Animated.View>
          </TouchableOpacity>
        </Modal>
        
        {/* Session Bottom Controls - For All Users */}
        {isInSession && (
          <SessionBottomControls
            onScreenShare={() => {}}
            onWardrobePress={handleWardrobePress}
            onToggleMute={toggleMute}
            onEndCall={handleEndAndCleanup}
            isMuted={isMuted}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 80, // Space for bottom navigation
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 8,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoIcon: {
    width: 24,
    height: 24,
    borderRadius: 4,
    backgroundColor: '#E91E63',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  logoText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  logoLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  logoImage: {
    width: 100,
    height: 28,
  },
  headerIcon: {
    width: 18,
    height: 18,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    padding: 8,
    borderRadius: 16,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    height: 40,
    gap: 8,
  },
  searchBarLogo: {
    width: 20,
    height: 20,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#333',
    padding: 0,
  },
  categoriesContainer: {
    backgroundColor: 'white',
    paddingVertical: 12,
    marginBottom: 6,
  },
  categoriesList: {
    paddingHorizontal: 16,
  },
  categoryItem: {
    alignItems: 'center',
    marginRight: 16,
    paddingVertical: 2,
  },
  selectedCategory: {
    // Add selected state styling if needed
  },
  categoryIcon: {
    width: 50,
    height: 50,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  activeCategoryIcon: {
    // No border for active state
  },
  categoryEmoji: {
    fontSize: 20,
  },
  categoryIconImage: {
    width: 50,
    height: 50,
    borderRadius: 6,
  },
  categoryName: {
    fontSize: 11,
    color: '#333',
    fontWeight: '500',
    textAlign: 'center',
  },
  selectedCategoryName: {
    color: '#E91E63',
    fontWeight: '600',
  },
  productsContainer: {
    paddingHorizontal: 8,
    backgroundColor: '#ffffff',
  },
  productsList: {
    paddingVertical: 8,
    paddingBottom: 20,
  },
  row: {
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  productCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    margin: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    height: 260,
    flex: 1,
  },
  productImageContainer: {
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: 150,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  newBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
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
    position: 'absolute',
    top: 8,
    right: 8,
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
    position: 'absolute',
    bottom: 8,
    left: 8,
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
  productInfo: {
    padding: 8,
    height: 100,
    flexDirection: 'column',
    justifyContent: 'space-between',
  },
  brandName: {
    fontSize: 8,
    color: '#999',
    marginBottom: 6,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    flexShrink: 0,
  },
  productName: {
    fontSize: 10,
    color: '#1a1a1a',
    fontWeight: '600',
    marginBottom: -2,
    lineHeight: 13,
    flex: 1,
    minHeight: 20,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -2,
    marginBottom: 6,
    flexShrink: 0,
  },
  price: {
    fontSize: 11,
    color: '#1a1a1a',
    fontWeight: 'bold',
    marginRight: 4,
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
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  exploreMenu: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  menuItems: {
    paddingTop: 12,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuItemText: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  menuIconImage: {
    width: 24,
    height: 24,
  },
  // Main Category Tabs
  mainCategoryTabs: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mainCategoryTab: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
    paddingVertical: 4,
  },
  mainCategoryText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  activeMainCategoryText: {
    color: '#000',
    fontWeight: '600',
  },
  activeUnderline: {
    position: 'absolute',
    bottom: -12,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#E91E63',
    borderRadius: 1,
  },
  // Promotional Banner 1
  promoBanner1: {
    flexDirection: 'row',
    backgroundColor: '#6A1B9A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  promoBanner1Left: {
    flex: 1,
  },
  promoBanner1Logo: {
    backgroundColor: '#E91E63',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  promoBanner1LogoText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  promoBanner1Center: {
    flex: 2,
    alignItems: 'center',
  },
  promoBanner1Title: {
    color: '#FFD700',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  promoBanner1Right: {
    flex: 1,
    alignItems: 'flex-end',
  },
  promoBanner1Date: {
    color: 'white',
    fontSize: 10,
    marginBottom: 6,
  },
  promoBanner1Button: {
    backgroundColor: '#E91E63',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 3,
  },
  promoBanner1ButtonText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  // Main Banner
  mainBanner: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#E91E63',
    borderStyle: 'dashed',
  },
  mainBannerImageContainer: {
    position: 'relative',
    height: 160,
  },
  mainBannerImage: {
    width: '100%',
    height: '100%',
  },
  mainBannerOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  mainBannerTextLeft: {
    flex: 1,
  },
  mainBannerTitle: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  mainBannerDiscount: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  mainBannerTextCenter: {
    flex: 1,
    alignItems: 'center',
  },
  mainBannerBrand: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  mainBannerTextRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  mainBannerButton: {
    backgroundColor: '#E91E63',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 3,
  },
  mainBannerButtonText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  adLabel: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adLabelText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  // Carousel Indicators
  carouselIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  indicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ccc',
  },
  activeIndicator: {
    backgroundColor: '#E91E63',
  },
  // Sponsor Section
  sponsorSection: {
    flexDirection: 'row',
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  sponsorItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sponsorText: {
    fontSize: 9,
    color: '#666',
    textAlign: 'center',
    flex: 1,
  },
  sponsorDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#ddd',
    marginHorizontal: 6,
  },
  // Cashback Banner
  cashbackBanner: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  cashbackCardImage: {
    width: 50,
    height: 32,
    borderRadius: 6,
    marginRight: 12,
  },
  cashbackTextContainer: {
    flex: 1,
  },
  cashbackTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  cashbackSubtitle: {
    fontSize: 10,
    color: '#666',
  },
  // Bottom Navigation
  bottomNavigation: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingVertical: 6,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  bottomTab: {
    alignItems: 'center',
    flex: 1,
  },
  bottomTabIcon: {
    width: 32,
    height: 32,
    marginBottom: 2,
  },
  bottomTabText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#E91E63',
    fontWeight: '600',
  },
  bottomTabSubtext: {
    fontSize: 8,
    color: '#999',
    marginTop: 1,
  },
  // Mock Cards Section
  mockCardsSection: {
    backgroundColor: 'white',
    paddingVertical: 12,
    marginBottom: 8,
  },
  mockCardsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  mockCardsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  sectionContainer: {
    backgroundColor: 'white',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  mockCard: {
    width: 160,
    backgroundColor: 'white',
    borderRadius: 8,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  mockCardImageContainer: {
    position: 'relative',
  },
  mockCardImage: {
    width: '100%',
    height: 150,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  mockCardBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },
  mockCardBadgeText: {
    fontSize: 8,
    color: 'white',
    fontWeight: 'bold',
  },
  mockCardDiscount: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: '#E91E63',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },
  mockCardDiscountText: {
    fontSize: 8,
    color: 'white',
    fontWeight: 'bold',
  },
  mockCardInfo: {
    padding: 10,
    minHeight: 110,
    justifyContent: 'space-between',
  },
  mockCardBrand: {
    fontSize: 8,
    color: '#999',
    marginBottom: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  mockCardName: {
    fontSize: 10,
    color: '#1a1a1a',
    fontWeight: '600',
    marginBottom: 6,
    lineHeight: 14,
    flex: 1,
  },
  mockCardPriceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  mockCardPrice: {
    fontSize: 11,
    color: '#1a1a1a',
    fontWeight: 'bold',
    marginRight: 4,
  },
  mockCardOriginalPrice: {
    fontSize: 8,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  mockCardRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 'auto',
  },
  mockCardRatingText: {
    fontSize: 8,
    color: '#666',
    fontWeight: '500',
  },
  // Banner Carousel
  bannerCarousel: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  bannerSlide: {
    width: screenWidth - 32,
  },
  bannerImageContainer: {
    position: 'relative',
    height: 180,
  },
  bannerImage: {
    width: '100%',
    height: '100%',
  },
  bannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  bannerTextLeft: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  bannerDiscount: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: '600',
  },
  bannerTextCenter: {
    flex: 1,
    alignItems: 'center',
  },
  bannerBrand: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  bannerTextRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  bannerButton: {
    backgroundColor: '#E91E63',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bannerButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  // Fixed Play Button
  playButton: {
    position: 'absolute',
    bottom: 120,
    right: 30,
    width: 40,
    height: 40,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    zIndex: 1000,
  },
  playButtonInner: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonActive: {
    backgroundColor: '#E91E63',
  },
  // Play Menu Modal
  playMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingRight: 40,
    paddingBottom: 110,
  },
  playMenuContainer: {
    paddingTop: 8,
    paddingHorizontal: 16,
    width: 340,
    maxHeight: 400,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  playMenuList: {
    gap: 4,
  },
  playMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'white',
    borderRadius: 6,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  playMenuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  playMenuIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 4,
    overflow: 'hidden',
    marginRight: 8,
  },
  playMenuIcon: {
    width: '100%',
    height: '100%',
  },
  playMenuItemText: {
    flex: 1,
  },
  playMenuItemTitle: {
    fontSize:11,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 1,
  },
  playMenuItemDescription: {
    fontSize: 7,
    color: '#666',
  },
  playMenuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playMenuNewTag: {
    backgroundColor: '#E91E63',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
  },
  playMenuNewTagText: {
    color: 'white',
    fontSize: 6,
    fontWeight: 'bold',
  },
  playMenuExploreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'white',
    borderRadius: 6,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  playMenuExploreTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#000',
  },
  // Glow effect only for "New" tag
  playMenuNewTagGlow: {
    backgroundColor: '#FF6B9D',
    shadowColor: '#E91E63',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  // Send to Chat Button styles
  productCardInner: {
    flex: 1,
  },
  sendToChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 6,
  },
  sendToChatText: {
    fontSize: 12,
    color: '#E91E63',
    fontWeight: '600',
  },
  // Mock Card Send to Chat Button styles
  mockCardInner: {
    flex: 1,
  },
  mockCardSendToChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 4,
  },
  mockCardSendToChatText: {
    fontSize: 10,
    color: '#E91E63',
    fontWeight: '600',
  },
  // Loading styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#8E8E93',
  },
});
