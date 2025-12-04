import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import { useProduct, useSimilarProducts, useRecommendedProducts, Product } from '../../hooks/useProducts';
import WardrobeSelector from '../../components/WardrobeSelector';
import RoomSelectionModal from '../../components/RoomSelectionModal';
import messageStorage from '../../services/messageStorage';
import socketService from '../../services/socketService';
import { useSession } from '../../contexts/session-context';
import { useAuth } from '../../contexts/auth-context';
import LiveBrowsePanel from '../../components/session/LiveBrowsePanel';
import { wardrobeApi } from '../../services/wardrobeApi';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function ProductDetailScreen() {
  const params = useLocalSearchParams();
  const id = params.id as string | undefined;
  const fromWardrobeId = params.fromWardrobeId as string | undefined;
  const normalizedId = typeof id === 'string' ? id : '';
  const { sessionRoomId, isInSession, selectedWardrobeId, setParticipantProduct, sessionParticipants, addParticipant, setParticipants } = useSession();
  const { user } = useAuth();
  
  // Always call hooks; guard their effects internally
  const { product, loading: productLoading } = useProduct(normalizedId);
  const { products: similarProducts } = useSimilarProducts(normalizedId, 4);
  const { products: youAlsoLikeProducts } = useRecommendedProducts(normalizedId, 4);

  // From here on, avoid early returns to keep hook order stable.

  const [selectedSize, setSelectedSize] = useState('');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showSizeChart, setShowSizeChart] = useState(false);
  const [showReviews, setShowReviews] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [showProductDetails, setShowProductDetails] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [quantity, setQuantity] = useState(1);
  
  // Initialize selected size when product loads
  React.useEffect(() => {
    if (product && !selectedSize) {
      const firstAvailable = product.availableSizes?.[0] || product.sizes?.[0] || '';
      setSelectedSize(firstAvailable);
    }
  }, [product, selectedSize]);

  // Broadcast product view to session participants and update locally
  React.useEffect(() => {
    if (!product || !isInSession || !sessionRoomId || !user) {
      console.log('📤 Browse view skipped:', { 
        hasProduct: !!product, 
        isInSession, 
        sessionRoomId, 
        hasUser: !!user 
      });
      return;
    }
    const payload = {
      userId: user._id,
      name: user.name,
      productId: product._id,
      productTitle: product.name,
      productImage: product.images?.[0] || product.image,
    };
    console.log('📤 Sending browse view:', payload);
    console.log('📤 Socket connected:', socketService.getConnectionStatus().isConnected);
    socketService.sendBrowseView(sessionRoomId, payload);
    // Ensure self exists in participants before updating product
    const selfExists = sessionParticipants.some(p => p.id === user._id);
    if (!selfExists) {
      addParticipant({
        id: user._id,
        name: user.name,
        avatar: user.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=4A90E2&color=FFFFFF&size=150`,
        isMuted: false,
        currentProduct: null,
      } as any);
    }
    // Update own current product locally (we won't rely on echo)
    console.log('📤 Updating participant product for current user:', payload.userId);
    setParticipantProduct(payload.userId, { id: payload.productId, name: payload.productTitle, image: payload.productImage });
    console.log('📤 Participant product updated for:', payload.userId);
  }, [product, isInSession, sessionRoomId, user, setParticipantProduct]);

  // Ensure browse updates update session context while on product screen
  React.useEffect(() => {
    if (isInSession && user) {
      // Join user room for follow notifications
      socketService.joinUser(user._id);
    }

    socketService.updateCallbacks({
      onBrowseUpdate: (data) => {
        if (data?.userId) {
          if (data.productId) {
            setParticipantProduct(data.userId, {
              id: data.productId,
              name: data.productTitle,
              image: data.productImage,
            });
          } else {
            // Clear when productId is null
            setParticipantProduct(data.userId, null);
          }
        }
      },
      onSessionParticipants: (participants) => {
        if (!Array.isArray(participants) || !isInSession || !user) return;
        const normalizedRaw = participants.map((p: any) => {
          const isCurrent = p.userId === user._id;
          const displayName = isCurrent ? user.name : (p.userName || p.name);
          const fallbackAvatarName = displayName && typeof displayName === 'string' ? displayName : 'User';
          const avatar = isCurrent
            ? (user.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=4A90E2&color=FFFFFF&size=150`)
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
        const seen = new Set<string>();
        const normalized = normalizedRaw.filter((p: any) => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
        setParticipants(normalized as any);
      },
      onFollowNavigate: (data) => {
        console.log('🧭 Follow navigation triggered on product screen:', data);
        if (data?.productId && data?.leaderUserId) {
          // Navigate to the leader's product if following
          router.replace(`/product/${data.productId}` as any);
        }
      },
    });
    return () => {
      if (isInSession && sessionRoomId && user) {
        console.log('🧹 Clearing browse view for user:', user.name);
        socketService.sendBrowseClear(sessionRoomId, { userId: user._id, name: user.name });
        setParticipantProduct(user._id, null);
      }
    };
  }, [setParticipantProduct, isInSession, user]);
  
  // Wardrobe and Chat functionality
  const [showWardrobeSelector, setShowWardrobeSelector] = useState(false);
  const [selectedRoomIdForWardrobe, setSelectedRoomIdForWardrobe] = useState<string | null>(null);
  const [addingToWardrobe, setAddingToWardrobe] = useState(false);
  const [sendingToChat, setSendingToChat] = useState(false);
  
  const scrollViewRef = useRef<ScrollView>(null);
  const imageScrollRef = useRef<ScrollView>(null);

  const youMayAlsoLike = youAlsoLikeProducts;

  const handleImageScroll = (event: any) => {
    const contentOffset = event.nativeEvent.contentOffset.x;
    const index = Math.round(contentOffset / screenWidth);
    setCurrentImageIndex(index);
  };

  // Wardrobe functionality
  const handleAddToWardrobe = () => {
    // If in a session with a selected wardrobe, add directly to that wardrobe
    if (isInSession && selectedWardrobeId) {
      handleWardrobeSelect(selectedWardrobeId);
      return;
    }
    
    // If arrived from a wardrobe, preselect that wardrobe's room context
    if (fromWardrobeId) {
      setSelectedRoomIdForWardrobe(sessionRoomId || null);
      setShowWardrobeSelector(true);
      return;
    }
    // If we are already in a room session, use that room; otherwise ask user to pick a room first
    if (sessionRoomId) {
      setSelectedRoomIdForWardrobe(sessionRoomId);
      setShowWardrobeSelector(true);
    } else {
      setShowRoomSelectionForWardrobe(true);
    }
  };

  const handleWardrobeSelect = async (wardrobeId: string) => {
    setAddingToWardrobe(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        Alert.alert('Error', 'Please log in to add products to wardrobe');
        setAddingToWardrobe(false);
        return;
      }

      console.log('Adding product to wardrobe:', {
        wardrobeId,
        productId: product._id,
        productName: product.name
      });

      const response = await wardrobeApi.addToWardrobe(token, wardrobeId, product._id, {
        notes: `Added from product screen`,
        priority: 'medium'
      });

      console.log('Add to wardrobe response:', response);

      if (response.status === 'success') {
        Alert.alert('Success', 'Product added to wardrobe!');
        setShowWardrobeSelector(false);
        setSelectedRoomIdForWardrobe(null);
      } else {
        Alert.alert('Error', response.message || 'Failed to add product to wardrobe');
      }
    } catch (error) {
      console.error('Error adding to wardrobe:', error);
      Alert.alert('Error', `Failed to add product to wardrobe: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setAddingToWardrobe(false);
    }
  };

  // Send to Chat: open room selection like catalog
  const [showRoomSelection, setShowRoomSelection] = useState(false);
  const [showRoomSelectionForWardrobe, setShowRoomSelectionForWardrobe] = useState(false);
  const handleSendToChat = () => {
    setShowRoomSelection(true);
  };

  // After selecting a room for wardrobe add, open the wardrobe selector filtered by that room
  const handleRoomSelectForWardrobe = (room: any) => {
    setSelectedRoomIdForWardrobe(room._id);
    setShowRoomSelectionForWardrobe(false);
    setShowWardrobeSelector(true);
  };

  // After selecting a room, send product message then navigate
  const handleRoomSelect = async (room: any) => {
    try {
      setSendingToChat(true);
      const productMessage = {
        id: `product_${product._id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: `Check out this ${product.name}!`,
        sender: 'user' as 'user' | 'friend' | 'ai' | 'maya',
        senderName: 'You',
        senderAvatar: 'https://ui-avatars.com/api/?name=You&background=FF6B9D&color=FFFFFF&size=150',
        timestamp: new Date().toISOString(),
        isProduct: true,
        productData: {
          productId: product._id,
          _id: product._id,
          name: product.name,
          price: `₹${product.price.toLocaleString()}`,
          image: product.image,
          description: product.description || `${product.brand} ${product.name}`,
          brand: product.brand,
          category: product.category,
          rating: product.rating,
          discountPercentage: product.discountPercentage,
          originalPrice: product.originalPrice ? `₹${product.originalPrice.toLocaleString()}` : undefined,
        },
        reactions: { thumbsUp: 0, thumbsDown: 0 },
      };

      await messageStorage.addMessage(room._id, productMessage);

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
          reactions: productMessage.reactions,
        });
      }

      setShowRoomSelection(false);
      router.push(`/room/${room._id}` as any);
    } catch (error) {
      console.error('❌ Error sending product to chat:', error);
    } finally {
      setSendingToChat(false);
    }
  };

  const renderProductImage = ({ item, index }: { item: string; index: number }) => (
    <View style={styles.imageContainer}>
      <Image source={{ uri: item }} style={styles.productImage} contentFit="cover" />
      {index === 0 && (
        <View style={styles.viewSimilarButton}>
          <Text style={styles.viewSimilarText}>View Similar</Text>
        </View>
      )}
      {index === 0 && (
        <View style={styles.ratingOverlay}>
          <View style={styles.ratingBox}>
            <Ionicons name="star" size={12} color="#4CAF50" />
            <Text style={styles.ratingText}>{product.rating}</Text>
            <Text style={styles.reviewCount}>{product.reviewCount}</Text>
          </View>
        </View>
      )}
    </View>
  );

  const renderSizeOption = (size: string) => {
    const isAvailable = product.availableSizes.includes(size);
    const isSelected = selectedSize === size;
    
    return (
      <TouchableOpacity
        style={[
          styles.sizeOption,
          !isAvailable && styles.sizeOptionUnavailable,
          isSelected && styles.sizeOptionSelected
        ]}
        onPress={() => isAvailable && setSelectedSize(size)}
        disabled={!isAvailable}
      >
        <Text style={[
          styles.sizeOptionText,
          !isAvailable && styles.sizeOptionTextUnavailable,
          isSelected && styles.sizeOptionTextSelected
        ]}>
          {size}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderSimilarProduct = ({ item }: { item: Product }) => (
    <TouchableOpacity 
      style={styles.similarProductCard}
      onPress={() => router.push(`/product/${item._id}` as any)}
    >
      <View style={styles.similarProductImageContainer}>
        <Image source={{ uri: item.image }} style={styles.similarProductImage} contentFit="cover" />
        {item.discountPercentage > 0 && (
          <View style={styles.similarProductDiscount}>
            <Text style={styles.similarProductDiscountText}>{item.discountPercentage}% OFF</Text>
          </View>
        )}
      </View>
      <View style={styles.similarProductInfo}>
        <Text style={styles.similarProductBrand}>{item.brand}</Text>
        <Text style={styles.similarProductName} numberOfLines={2}>{item.name}</Text>
        <View style={styles.similarProductPriceContainer}>
          <Text style={styles.similarProductPrice}>₹{item.price.toLocaleString()}</Text>
          {item.originalPrice > item.price && (
            <Text style={styles.similarProductOriginalPrice}>₹{item.originalPrice.toLocaleString()}</Text>
          )}
        </View>
        <View style={styles.similarProductRating}>
          <Ionicons name="star" size={12} color="#FFD700" />
          <Text style={styles.similarProductRatingText}>{item.rating}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderReview = ({ item }: { item: any }) => (
    <View style={styles.reviewItem}>
      <View style={styles.reviewHeader}>
        <Text style={styles.reviewUserName}>{item.userName}</Text>
        <View style={styles.reviewRating}>
          {[...Array(5)].map((_, i) => (
            <Ionicons 
              key={i} 
              name={i < item.rating ? "star" : "star-outline"} 
              size={14} 
              color="#FFD700" 
            />
          ))}
        </View>
      </View>
      <Text style={styles.reviewComment}>{item.comment}</Text>
      <Text style={styles.reviewDate}>{item.date}</Text>
    </View>
  );

  // Render fallbacks when id missing or data not ready, without breaking hook order
  if (!normalizedId) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Product ID not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (productLoading) {
    return (
      <View style={styles.errorContainer}>
        <ActivityIndicator size="small" color="#E91E63" />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Product not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.container}>
        {isInSession && (
          <LiveBrowsePanel 
            currentUserId={user?._id} 
            onFollowUser={(userId) => {}} 
          />
        )}
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={20} color="#000" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Product Details</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity 
              style={styles.headerButton}
              onPress={() => setIsWishlisted(!isWishlisted)}
            >
              <Ionicons 
                name={isWishlisted ? "heart" : "heart-outline"} 
                size={20} 
                color={isWishlisted ? "#E91E63" : "#000"} 
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerButton}>
              <Ionicons name="bag-outline" size={20} color="#000" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView 
          ref={scrollViewRef}
          style={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Product Images */}
          <View style={styles.imagesSection}>
            <ScrollView
              ref={imageScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleImageScroll}
            >
              {product.images.map((image, index) => (
                <View key={index} style={styles.imageContainer}>
                  <Image source={{ uri: image }} style={styles.productImage} contentFit="cover" />
                  {index === 0 && (
                    <View style={styles.viewSimilarButton}>
                      <Text style={styles.viewSimilarText}>View Similar</Text>
                    </View>
                  )}
                  {index === 0 && (
                    <View style={styles.ratingOverlay}>
                      <View style={styles.ratingBox}>
                        <Ionicons name="star" size={12} color="#4CAF50" />
                        <Text style={styles.ratingText}>{product.rating}</Text>
                        <Text style={styles.reviewCount}>{product.reviewCount}</Text>
                      </View>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
            
            {/* Image Indicators */}
            <View style={styles.imageIndicators}>
              {product.images.map((_, index) => (
                <View 
                  key={index} 
                  style={[
                    styles.indicator, 
                    index === currentImageIndex && styles.activeIndicator
                  ]} 
                />
              ))}
            </View>
          </View>

          {/* Product Info */}
          <View style={styles.productInfoSection}>
            <Text style={styles.brandName}>{product.brand}</Text>
            <Text style={styles.productName}>{product.name}</Text>
            
            <View style={styles.priceContainer}>
              <Text style={styles.originalPrice}>MRP ₹{product.originalPrice.toLocaleString()}</Text>
              <Text style={styles.currentPrice}>₹{product.price.toLocaleString()}</Text>
              <View style={styles.discountTag}>
                <Text style={styles.discountTagText}>{product.discountPercentage}% OFF!</Text>
              </View>
            </View>

            {/* Special Offer */}
            <View style={styles.specialOfferContainer}>
              <View style={styles.specialOfferLeft}>
                <View style={styles.discountIcon}>
                  <Text style={styles.discountIconText}>3X DISCOUNT</Text>
                </View>
                <Text style={styles.specialOfferText}>Get at ₹{(product.price - product.offers.additionalDiscount).toLocaleString()}</Text>
              </View>
              <TouchableOpacity style={styles.extraDiscountButton}>
                <Text style={styles.extraDiscountText}>Extra ₹{product.offers.additionalDiscount} Off</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.offerDetails}>With Coupon + Bank Offer</Text>
            <TouchableOpacity style={styles.detailsLink}>
              <Text style={styles.detailsLinkText}>Details &gt;</Text>
            </TouchableOpacity>

            {/* Size Selection */}
            <View style={styles.sizeSection}>
              <View style={styles.sizeHeader}>
                <Text style={styles.sizeTitle}>Select Size</Text>
                <TouchableOpacity onPress={() => setShowSizeChart(true)}>
                  <Text style={styles.sizeChartLink}>Size Chart ></Text>
                </TouchableOpacity>
              </View>
              <View style={styles.sizeOptions}>
                {product.sizes.map((size) => (
                  <View key={size}>
                    {renderSizeOption(size)}
                  </View>
                ))}
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity 
                style={styles.wishlistButton}
                onPress={() => setIsWishlisted(!isWishlisted)}
              >
                <Ionicons 
                  name={isWishlisted ? "heart" : "heart-outline"} 
                  size={20} 
                  color={isWishlisted ? "#E91E63" : "#000"} 
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.buyNowButton}>
                <Ionicons name="bag-outline" size={20} color="#E91E63" />
                <Text style={styles.buyNowText}>Buy Now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addToBagButton}>
                <Ionicons name="bag-outline" size={20} color="#fff" />
                <Text style={styles.addToBagText}>Add to Bag</Text>
              </TouchableOpacity>
            </View>

            {/* Wardrobe and Chat Actions */}
            <View style={styles.wardrobeChatActions}>
              <TouchableOpacity 
                style={styles.wardrobeButton}
                onPress={handleAddToWardrobe}
                disabled={addingToWardrobe}
              >
                {addingToWardrobe ? (
                  <ActivityIndicator size="small" color="#E91E63" />
                ) : (
                  <Ionicons name="shirt-outline" size={20} color="#E91E63" />
                )}
                <Text style={styles.wardrobeButtonText}>
                  {isInSession && selectedWardrobeId ? 'Add to Session Wardrobe' : 'Add to Wardrobe'}
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.chatButton}
                onPress={handleSendToChat}
                disabled={sendingToChat}
              >
                {sendingToChat ? (
                  <ActivityIndicator size="small" color="#4CAF50" />
                ) : (
                  <Ionicons name="chatbubble-outline" size={20} color="#4CAF50" />
                )}
                <Text style={styles.chatButtonText}>Send to Chat</Text>
              </TouchableOpacity>
            </View>

            {/* Delivery & Services */}
            <View style={styles.deliverySection}>
              <Text style={styles.sectionTitle}>Delivery & Services</Text>
              <View style={styles.deliveryLocation}>
                <Text style={styles.locationText}>52GC+2W9 - PDPM IIITDM Jabalpur, Madhya Pradesh 482005</Text>
                <TouchableOpacity>
                  <Text style={styles.changeText}>Change</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.deliveryOption}>
                <View style={styles.deliveryIcon}>
                  <Ionicons name="cube-outline" size={20} color="#000" />
                </View>
                <View style={styles.deliveryInfo}>
                  <Text style={styles.deliveryType}>STANDARD</Text>
                  <Text style={styles.deliveryEstimate}>Delivery between {product?.delivery?.standard?.estimatedDays ?? '3-7 days'}</Text>
                  <View style={styles.deliveryPrice}>
                    {product?.delivery?.standard?.originalPrice != null && (
                      <Text style={styles.deliveryOriginalPrice}>MRP ₹{product.delivery.standard.originalPrice.toLocaleString()}</Text>
                    )}
                    {product?.delivery?.standard?.price != null && product?.delivery?.standard?.discount != null && (
                      <Text style={styles.deliveryCurrentPrice}>₹{product.delivery.standard.price.toLocaleString()} ({product.delivery.standard.discount}% OFF)</Text>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.paymentOption}>
                <View style={styles.paymentIcon}>
                  <Ionicons name="card-outline" size={20} color="#4CAF50" />
                </View>
                <View style={styles.paymentInfo}>
                  <Text style={styles.paymentText}>Pay on Delivery is available</Text>
                  <Text style={styles.paymentFee}>₹{product?.paymentOptions?.codFee ?? 0} additional fee applicable</Text>
                </View>
              </View>

              <View style={styles.returnOption}>
                <View style={styles.returnIcon}>
                  <Ionicons name="refresh-outline" size={20} color="#4CAF50" />
                </View>
                <Text style={styles.returnText}>{product?.returnPolicy ?? '7 days return policy'}</Text>
              </View>
            </View>

            {/* Product Details */}
            <TouchableOpacity 
              style={styles.sectionHeader}
              onPress={() => setShowProductDetails(!showProductDetails)}
            >
              <Text style={styles.sectionTitle}>Product details</Text>
              <Ionicons 
                name={showProductDetails ? "chevron-up" : "chevron-down"} 
                size={20} 
                color="#000" 
              />
            </TouchableOpacity>
            
            {showProductDetails && (
              <View style={styles.productDetailsContent}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Sustainable.</Text>
                  <Text style={styles.detailValue}>{product.sustainability}</Text>
                </View>
                <Text style={styles.productDescription}>{product.description}</Text>
                <TouchableOpacity style={styles.viewMoreLink}>
                  <Text style={styles.viewMoreText}>View More</Text>
                  <Ionicons name="chevron-down" size={16} color="#000" />
                </TouchableOpacity>
              </View>
            )}

            {/* Customer Questions */}
            <TouchableOpacity 
              style={styles.sectionHeader}
              onPress={() => setShowQuestions(!showQuestions)}
            >
              <Text style={styles.sectionTitle}>Customer Questions</Text>
              <Ionicons 
                name={showQuestions ? "chevron-up" : "chevron-down"} 
                size={20} 
                color="#000" 
              />
            </TouchableOpacity>

            {/* Ratings & Reviews */}
            <TouchableOpacity 
              style={styles.sectionHeader}
              onPress={() => setShowReviews(!showReviews)}
            >
              <Text style={styles.sectionTitle}>Ratings & Reviews</Text>
              <Ionicons 
                name={showReviews ? "chevron-up" : "chevron-down"} 
                size={20} 
                color="#000" 
              />
            </TouchableOpacity>
            
            {showReviews && (
              <View style={styles.reviewsContent}>
                <View style={styles.overallRating}>
                  <View style={styles.ratingBox}>
                    <Text style={styles.overallRatingText}>{product.rating}</Text>
                    <Ionicons name="star" size={20} color="#4CAF50" />
                  </View>
                  <Text style={styles.ratingSummary}>{product.reviewCount} ratings | {product.reviews.length} reviews</Text>
                  <Ionicons name="chevron-forward" size={16} color="#000" />
                </View>
                
                <FlatList
                  data={product.reviews}
                  renderItem={renderReview}
                  keyExtractor={(item) => item._id}
                  scrollEnabled={false}
                />
              </View>
            )}

            {/* Similar Products */}
            <View style={styles.similarProductsSection}>
              <Text style={styles.sectionTitle}>Similar Products</Text>
              <FlatList
                data={similarProducts}
                renderItem={renderSimilarProduct}
                keyExtractor={(item) => item._id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.similarProductsList}
              />
            </View>

            {/* You May Also Like */}
            <View style={styles.youMayAlsoLikeSection}>
              <Text style={styles.sectionTitle}>You may also like</Text>
              <FlatList
                data={youMayAlsoLike}
                renderItem={renderSimilarProduct}
                keyExtractor={(item) => item._id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.similarProductsList}
              />
            </View>
          </View>
        </ScrollView>

        {/* Size Chart Modal */}
        <Modal
          visible={showSizeChart}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowSizeChart(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.sizeChartModal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Size Chart</Text>
                <TouchableOpacity onPress={() => setShowSizeChart(false)}>
                  <Ionicons name="close" size={24} color="#000" />
                </TouchableOpacity>
              </View>
              <Text style={styles.sizeChartText}>Size chart content would go here</Text>
            </View>
          </View>
        </Modal>

        {/* Wardrobe Selector Modal */}
        <WardrobeSelector
          visible={showWardrobeSelector}
          onClose={() => setShowWardrobeSelector(false)}
          onSelect={handleWardrobeSelect}
          productName={product.name}
          productPrice={`₹${product.price.toLocaleString()}`}
          loading={addingToWardrobe}
          roomId={(selectedRoomIdForWardrobe || sessionRoomId || undefined) as string | undefined}
        />

        {/* Room Selection Modal for Send to Chat */}
        <RoomSelectionModal
          visible={showRoomSelection}
          onClose={() => setShowRoomSelection(false)}
          onRoomSelect={handleRoomSelect}
          productName={product.name}
        />

        {/* Room Selection Modal for Add to Wardrobe (ensures room-scoped wardrobes) */}
        <RoomSelectionModal
          visible={showRoomSelectionForWardrobe}
          onClose={() => setShowRoomSelectionForWardrobe(false)}
          onRoomSelect={handleRoomSelectForWardrobe}
          productName={product.name}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#E91E63',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerButton: {
    padding: 6,
  },
  headerCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imagesSection: {
    position: 'relative',
  },
  imageContainer: {
    width: screenWidth,
    height: 400,
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  viewSimilarButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewSimilarText: {
    fontSize: 12,
    color: '#000',
    fontWeight: '500',
    marginRight: 4,
  },
  ratingOverlay: {
    position: 'absolute',
    bottom: 20,
    right: 20,
  },
  ratingBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 12,
    color: '#000',
    fontWeight: '600',
    marginLeft: 4,
  },
  reviewCount: {
    fontSize: 10,
    color: '#666',
    marginLeft: 2,
  },
  imageIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
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
  productInfoSection: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  brandName: {
    fontSize: 11,
    color: '#666',
    marginBottom: 2,
    fontWeight: '500',
  },
  productName: {
    fontSize: 14,
    color: '#000',
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 18,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  originalPrice: {
    fontSize: 11,
    color: '#999',
    textDecorationLine: 'line-through',
    marginRight: 6,
  },
  currentPrice: {
    fontSize: 16,
    color: '#000',
    fontWeight: 'bold',
    marginRight: 6,
  },
  discountTag: {
    backgroundColor: '#E91E63',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  discountTagText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: 'bold',
  },
  specialOfferContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8f9fa',
    padding: 8,
    borderRadius: 6,
    marginBottom: 6,
  },
  specialOfferLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  discountIcon: {
    backgroundColor: '#E91E63',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginRight: 6,
  },
  discountIconText: {
    fontSize: 8,
    color: '#fff',
    fontWeight: 'bold',
  },
  specialOfferText: {
    fontSize: 11,
    color: '#000',
    fontWeight: '600',
  },
  extraDiscountButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  extraDiscountText: {
    fontSize: 9,
    color: '#fff',
    fontWeight: 'bold',
  },
  offerDetails: {
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
  },
  detailsLink: {
    alignSelf: 'flex-end',
  },
  detailsLinkText: {
    fontSize: 10,
    color: '#E91E63',
    fontWeight: '500',
  },
  sizeSection: {
    marginVertical: 12,
  },
  sizeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sizeTitle: {
    fontSize: 13,
    color: '#000',
    fontWeight: '600',
  },
  sizeChartLink: {
    fontSize: 11,
    color: '#E91E63',
    fontWeight: '500',
  },
  sizeOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  sizeOption: {
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 3,
    minWidth: 32,
    alignItems: 'center',
  },
  sizeOptionSelected: {
    borderColor: '#E91E63',
    backgroundColor: '#fce4ec',
  },
  sizeOptionUnavailable: {
    borderColor: '#ccc',
    backgroundColor: '#f5f5f5',
  },
  sizeOptionText: {
    fontSize: 11,
    color: '#000',
    fontWeight: '500',
  },
  sizeOptionTextSelected: {
    color: '#E91E63',
    fontWeight: '600',
  },
  sizeOptionTextUnavailable: {
    color: '#999',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    gap: 8,
  },
  wishlistButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 8,
    borderRadius: 6,
  },
  buyNowButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E91E63',
    padding: 8,
    borderRadius: 6,
    gap: 4,
  },
  buyNowText: {
    fontSize: 11,
    color: '#E91E63',
    fontWeight: '600',
  },
  addToBagButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E91E63',
    padding: 8,
    borderRadius: 6,
    gap: 4,
  },
  addToBagText: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
  },
  deliverySection: {
    marginVertical: 12,
  },
  sectionTitle: {
    fontSize: 13,
    color: '#000',
    fontWeight: '600',
    marginBottom: 8,
  },
  deliveryLocation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  locationText: {
    fontSize: 10,
    color: '#666',
    flex: 1,
    marginRight: 6,
  },
  changeText: {
    fontSize: 10,
    color: '#E91E63',
    fontWeight: '500',
  },
  deliveryOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  deliveryIcon: {
    marginRight: 8,
    marginTop: 1,
  },
  deliveryInfo: {
    flex: 1,
  },
  deliveryType: {
    fontSize: 10,
    color: '#000',
    fontWeight: '600',
    marginBottom: 1,
  },
  deliveryEstimate: {
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
  },
  deliveryPrice: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deliveryOriginalPrice: {
    fontSize: 8,
    color: '#999',
    textDecorationLine: 'line-through',
    marginRight: 6,
  },
  deliveryCurrentPrice: {
    fontSize: 10,
    color: '#000',
    fontWeight: '500',
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  paymentIcon: {
    marginRight: 8,
    marginTop: 1,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentText: {
    fontSize: 10,
    color: '#000',
    marginBottom: 1,
  },
  paymentFee: {
    fontSize: 8,
    color: '#666',
  },
  returnOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  returnIcon: {
    marginRight: 8,
    marginTop: 1,
  },
  returnText: {
    fontSize: 10,
    color: '#000',
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  productDetailsContent: {
    paddingVertical: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 11,
    color: '#000',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 11,
    color: '#666',
  },
  productDescription: {
    fontSize: 11,
    color: '#666',
    lineHeight: 16,
    marginBottom: 6,
  },
  viewMoreLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  viewMoreText: {
    fontSize: 10,
    color: '#E91E63',
    fontWeight: '500',
    marginRight: 2,
  },
  reviewsContent: {
    paddingVertical: 8,
  },
  overallRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  overallRatingText: {
    fontSize: 18,
    color: '#000',
    fontWeight: 'bold',
    marginRight: 6,
  },
  ratingSummary: {
    fontSize: 10,
    color: '#666',
    flex: 1,
    marginLeft: 6,
  },
  reviewItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  reviewUserName: {
    fontSize: 11,
    color: '#000',
    fontWeight: '500',
  },
  reviewRating: {
    flexDirection: 'row',
  },
  reviewComment: {
    fontSize: 11,
    color: '#666',
    lineHeight: 16,
    marginBottom: 2,
  },
  reviewDate: {
    fontSize: 9,
    color: '#999',
  },
  similarProductsSection: {
    marginVertical: 12,
  },
  youMayAlsoLikeSection: {
    marginVertical: 12,
  },
  similarProductsList: {
    paddingHorizontal: 0,
    paddingBottom: 20,
  },
  similarProductCard: {
    width: 160,
    marginRight: 12,
    backgroundColor: 'white',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  similarProductImageContainer: {
    position: 'relative',
  },
  similarProductImage: {
    width: '100%',
    height: 160,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  similarProductDiscount: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#E91E63',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  similarProductDiscountText: {
    fontSize: 8,
    color: '#fff',
    fontWeight: 'bold',
  },
  similarProductInfo: {
    padding: 10,
    minHeight: 100,
  },
  similarProductBrand: {
    fontSize: 9,
    color: '#999',
    marginBottom: 4,
    fontWeight: '500',
  },
  similarProductName: {
    fontSize: 11,
    color: '#000',
    fontWeight: '500',
    marginBottom: 6,
    lineHeight: 15,
    flex: 1,
  },
  similarProductPriceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  similarProductPrice: {
    fontSize: 12,
    color: '#000',
    fontWeight: 'bold',
    marginRight: 4,
  },
  similarProductOriginalPrice: {
    fontSize: 9,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  similarProductRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  similarProductRatingText: {
    fontSize: 9,
    color: '#666',
    marginLeft: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sizeChartModal: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  sizeChartText: {
    fontSize: 14,
    color: '#666',
    padding: 16,
  },
  wardrobeChatActions: {
    flexDirection: 'row',
    marginVertical: 12,
    gap: 8,
  },
  wardrobeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E91E63',
    padding: 12,
    borderRadius: 8,
    gap: 6,
  },
  wardrobeButtonText: {
    fontSize: 12,
    color: '#E91E63',
    fontWeight: '600',
  },
  chatButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4CAF50',
    padding: 12,
    borderRadius: 8,
    gap: 6,
  },
  chatButtonText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },
  chatButtonDisabled: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    borderRadius: 8,
    gap: 6,
  },
  chatButtonTextDisabled: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
});
