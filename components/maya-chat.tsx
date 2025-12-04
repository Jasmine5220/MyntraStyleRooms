import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../contexts/session-context';
import { wardrobeApi } from '../services/wardrobeApi';
import { IconSymbol } from './ui/icon-symbol';
import WardrobeSelector from './WardrobeSelector';

const { width: screenWidth } = Dimensions.get('window');

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'maya' | 'friend' | 'ai' | 'system';
  senderName: string;
  senderAvatar?: string;
  timestamp: string;
  isProduct?: boolean;
  productData?: {
    productId?: string;
    id?: string;
    _id?: string;
    name: string;
    price: string;
    image: string;
    description?: string;
    images?: string[];
  };
  reactions?: {
    thumbsUp: number;
    thumbsDown: number;
    userThumbsUp?: boolean;
    userThumbsDown?: boolean;
  };
}

interface MayaChatProps {
  roomName?: string;
  roomId?: string;
  onBack?: () => void;
  onMenuPress?: () => void;
  messages?: Message[];
  onSendMessage?: (text: string) => void;
  onProductAction?: (action: string, productData: any) => void;
  typingUsers?: string[];
  socketConnected?: boolean;
}

const MayaChat: React.FC<MayaChatProps> = ({
  roomName = "Maya",
  roomId,
  onBack,
  onMenuPress,
  messages = [],
  onSendMessage,
  onProductAction,
  typingUsers = [],
  socketConnected = false,
}) => {
  const [inputText, setInputText] = useState('');
  const [showProductModal, setShowProductModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showWardrobeSelector, setShowWardrobeSelector] = useState(false);
  const [addingToWardrobe, setAddingToWardrobe] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const { sessionRoomId } = useSession();

  const mayaAvatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face';

  const handleSendMessage = () => {
    if (inputText.trim() && onSendMessage) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleProductAction = (action: string, productData: any) => {
    console.log('🔍 Product action:', action);
    console.log('📦 Product data structure:', JSON.stringify(productData, null, 2));
    
    if (onProductAction) {
      onProductAction(action, productData);
    }
    if (action === 'view_items') {
      setSelectedProduct(productData);
      setShowProductModal(true);
    } else if (action === 'add_to_wardrobe') {
      setSelectedProduct(productData);
      setShowWardrobeSelector(true);
    }
  };

  const navigateToProductDetails = (productData: any) => {
    const productId = productData?.productId || productData?.id || productData?._id || productData?.product_id;
    if (!productId) {
      Alert.alert('Unavailable', 'This product cannot be opened right now.');
      return;
    }
    router.push(`/product/${productId}` as any);
  };

  const handleWardrobeSelect = async (wardrobeId: string) => {
    if (!selectedProduct) return;

    setAddingToWardrobe(true);
    try {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        Alert.alert('Error', 'Please log in to add products to wardrobe');
        return;
      }

      console.log('🔍 Selected product for wardrobe:', JSON.stringify(selectedProduct, null, 2));
      console.log('🔍 Available ID fields:', {
        productId: selectedProduct.productId,
        id: selectedProduct.id,
        _id: selectedProduct._id,
        product_id: selectedProduct.product_id
      });

      const productId = selectedProduct.productId || selectedProduct.id || selectedProduct._id || selectedProduct.product_id;
      if (!productId) {
        console.error('❌ No valid product ID found in:', selectedProduct);
        Alert.alert('Error', 'Product ID not found. Cannot add to wardrobe.');
        return;
      }

      const response = await wardrobeApi.addToWardrobe(token, wardrobeId, productId, {
        notes: `Added from chat`,
        priority: 'medium'
      });

      if (response.status === 'success') {
        Alert.alert('Success', 'Product added to wardrobe!');
        setShowWardrobeSelector(false);
        setSelectedProduct(null);
      } else {
        Alert.alert('Error', response.message || 'Failed to add product to wardrobe');
      }
    } catch (error) {
      console.error('Error adding to wardrobe:', error);
      Alert.alert('Error', 'Failed to add product to wardrobe');
    } finally {
      setAddingToWardrobe(false);
    }
  };

  const renderProductCard = (productData: any, isUserMessage: boolean = false) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => navigateToProductDetails(productData)}
      style={[styles.productCard, isUserMessage && styles.userProductCard]}
    >
      {/* Main Product Image */}
      <View style={styles.productImageContainer}>
        <Image 
          source={{ uri: productData.image }} 
          style={styles.mainProductImage}
          contentFit="cover"
          onError={(error) => {
            console.log('Image load error:', error);
            console.log('Failed URL:', productData.image);
          }}
          onLoad={() => console.log('Image loaded successfully:', productData.image)}
          placeholder="https://via.placeholder.com/400x500/cccccc/666666?text=Loading..."
        />
        
        {/* Small product images grid */}
        {productData.images && productData.images.length > 0 && (
          <View style={styles.productImagesGrid}>
            {productData.images.slice(0, 4).map((img: string, index: number) => (
              <Image key={index} source={{ uri: img }} style={styles.smallProductImage} contentFit="cover" />
            ))}
            {productData.images.length > 4 && (
              <TouchableOpacity
                style={styles.viewItemsButton}
                onPress={() => handleProductAction('view_items', productData)}
              >
                <Text style={styles.viewItemsText}>View Items</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Product Info */}
      <View style={styles.productInfo}>
        <View style={styles.productTitleRow}>
          <Text style={styles.productTitle}>{productData.name}</Text>
          <TouchableOpacity
            style={styles.askMoreButton}
            onPress={() => handleProductAction('add_to_wardrobe', productData)}
          >
            <Text style={styles.askMoreText}>Add to Wardrobe</Text>
          </TouchableOpacity>
        </View>
        
        {productData.description && (
          <Text style={styles.productDescription}>{productData.description}</Text>
        )}
        
        {productData.price && (
          <Text style={styles.productPrice}>{productData.price}</Text>
        )}
      </View>

      {/* Reactions */}
      {productData.reactions && (
        <View style={styles.reactionsContainer}>
          <TouchableOpacity style={styles.reactionButton}>
            <Text style={styles.reactionEmoji}>👍</Text>
            <Text style={styles.reactionCount}>{productData.reactions.thumbsUp || 0}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reactionButton}>
            <Text style={styles.reactionEmoji}>👎</Text>
            <Text style={styles.reactionCount}>{productData.reactions.thumbsDown || 0}</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderMessage = ({ item }: { item: Message }) => {
    const isUserMessage = item.sender === 'user';
    const isMayaMessage = item.sender === 'maya' || item.sender === 'ai';

    return (
      <View style={styles.messageWrapper}>
        {/* Sender Info for non-user messages */}
        {!isUserMessage && (
          <View style={styles.messageHeader}>
            <Image 
              source={{ uri: item.senderAvatar || mayaAvatar }} 
              style={styles.avatar}
              contentFit="cover"
              placeholder="https://via.placeholder.com/36x36/E91E63/ffffff?text=M"
              onError={(error) => {
                console.log('Avatar load error:', error);
                console.log('Failed Avatar URL:', item.senderAvatar || mayaAvatar);
              }}
              onLoad={() => {
                console.log('Avatar loaded successfully:', item.senderAvatar || mayaAvatar);
              }}
            />
            <Text style={styles.senderName}>{item.senderName}</Text>
          </View>
        )}

        {/* Message Content */}
        <View style={[
          styles.messageContainer,
          isUserMessage ? styles.userMessage : styles.otherMessage,
          (isMayaMessage && !isUserMessage) && styles.mayaMessage,
        ]}>
          {item.isProduct && item.productData ? (
            renderProductCard(item.productData, isUserMessage)
          ) : (
            <Text style={[
              styles.messageText,
              isUserMessage ? styles.userMessageText : styles.otherMessageText,
              (isMayaMessage && !isUserMessage) && styles.mayaMessageText,
            ]}>
              {item.text}
            </Text>
          )}
          
          <Text style={[
            styles.timestamp,
            isUserMessage ? styles.userTimestamp : styles.otherTimestamp
          ]}>
            {item.timestamp}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
    {/* <View style={styles.container}> */}
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>‹</Text>
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>{roomName}</Text>
          </View>
          <TouchableOpacity onPress={onMenuPress} style={styles.menuButton}>
            <Text style={styles.menuButtonText}>⋮</Text>
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        />

        {/* Typing Indicators */}
        {typingUsers.length > 0 && (
          <View style={styles.typingContainer}>
            <Text style={styles.typingText}>
              {typingUsers.length === 1 
                ? `${typingUsers[0]} is typing...`
                : `${typingUsers.length} people are typing...`
              }
            </Text>
          </View>
        )}

        {/* Connection Status */}
        {!socketConnected && (
          <View style={styles.connectionStatus}>
            <Text style={styles.connectionText}>
              🔌 Connecting to real-time chat...
            </Text>
          </View>
        )}

        {/* Input Area */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.inputContainer}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type here..."
              placeholderTextColor="#999"
              multiline
              maxLength={500}
            />
            <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
              <IconSymbol name="paperplane.fill" size={20} color="#000" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

        {/* Product Modal */}
        <Modal
          visible={showProductModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowProductModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.productModal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Product Details</Text>
                <TouchableOpacity onPress={() => setShowProductModal(false)}>
                  <Text style={styles.closeButton}>✕</Text>
                </TouchableOpacity>
              </View>
              
              {selectedProduct && (
                <ScrollView style={styles.modalContent}>
                  <Image source={{ uri: selectedProduct.image }} style={styles.modalProductImage} contentFit="cover" />
                  <Text style={styles.modalProductName}>{selectedProduct.name}</Text>
                  <Text style={styles.modalProductPrice}>{selectedProduct.price}</Text>
                  {selectedProduct.description && (
                    <Text style={styles.modalProductDescription}>{selectedProduct.description}</Text>
                  )}
                  
                  {selectedProduct.images && selectedProduct.images.length > 0 && (
                    <View style={styles.modalImagesGrid}>
                      {selectedProduct.images.map((img: string, index: number) => (
                        <Image key={index} source={{ uri: img }} style={styles.modalSmallImage} contentFit="cover" />
                      ))}
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>

        {/* Wardrobe Selector Modal */}
        <WardrobeSelector
          visible={showWardrobeSelector}
          onClose={() => setShowWardrobeSelector(false)}
          onSelect={handleWardrobeSelect}
          productName={selectedProduct?.name}
          productPrice={selectedProduct?.price ? `₹${selectedProduct.price.toLocaleString()}` : undefined}
          loading={addingToWardrobe}
          roomId={sessionRoomId || roomId}
        />
      </SafeAreaView>
    {/* </View> */}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  backButtonText: {
    fontSize: 24,
    color: '#333',
    fontWeight: '300',
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  menuButton: {
    padding: 8,
  },
  menuButtonText: {
    fontSize: 18,
    color: '#333',
    fontWeight: '600',
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  messageWrapper: {
    marginVertical: 4,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    marginLeft: 4,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 8,
    backgroundColor: '#E91E63',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  messageContainer: {
    maxWidth: '82%',
    borderRadius: 12,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#E8E0FE',
    marginLeft: '15%',
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: 'white',
    marginRight: '15%',
  },
  messageText: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  userMessageText: {
    color: '#1a1a1a',
  },
  otherMessageText: {
    color: '#1a1a1a',
  },
  timestamp: {
    fontSize: 10,
    color: '#999',
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  userTimestamp: {
    color: '#666',
  },
  otherTimestamp: {
    color: '#999',
  },
  productCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    overflow: 'hidden',
    borderColor: 'transparent',
    borderWidth: 0,
    // Remove horizontal gutter inside the message bubble
    marginLeft: -8,
    marginRight: -8,
    // Remove top gutter so image touches the top of the bubble
    marginTop: -8,
  },
  userProductCard: {
    backgroundColor: '#f8f9fa',
    // Keep normal spacing for user messages
    marginTop: 0,
  },
  productImageContainer: {
    position: 'relative',
    backgroundColor: '#f0f0f0',
    height: 180,
  },
  mainProductImage: {
    width: '100%',
    height: 180,
    resizeMode: 'cover',
    backgroundColor: '#f0f0f0',
  },
  productImagesGrid: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 80,
  },
  smallProductImage: {
    width: 36,
    height: 36,
    borderRadius: 6,
    margin: 1,
    resizeMode: 'cover',
  },
  viewItemsButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'white',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  viewItemsText: {
    fontSize: 8,
    color: '#333',
    fontWeight: '600',
  },
  productInfo: {
    padding: 10,
  },
  productTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    flex: 1,
  },
  askMoreButton: {
    backgroundColor: '#E8E0FE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    marginLeft: 8,
  },
  askMoreText: {
    fontSize: 11,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  productDescription: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
    marginBottom: 6,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E91E63',
  },
  reactionsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 12,
  },
  reactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
  },
  reactionEmoji: {
    fontSize: 11,
    marginRight: 4,
  },
  reactionCount: {
    fontSize: 11,
    color: '#666',
    fontWeight: '400',
  },
  mayaMessage: {
    maxWidth: '78%',
    borderRadius: 10,
    padding: 8,
  },
  mayaMessageText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },
  inputContainer: {
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8E0FE',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#1a1a1a',
    maxHeight: 100,
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8E0FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonText: {
    fontSize: 16,
    color: '#1a1a1a',
  },
  disclaimer: {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productModal: {
    backgroundColor: 'white',
    borderRadius: 16,
    width: screenWidth * 0.9,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  closeButton: {
    fontSize: 20,
    color: '#666',
  },
  modalContent: {
    padding: 16,
  },
  modalProductImage: {
    width: '100%',
    height: 250,
    resizeMode: 'cover',
    borderRadius: 8,
    marginBottom: 12,
  },
  modalProductName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  modalProductPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E91E63',
    marginBottom: 12,
  },
  modalProductDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 16,
  },
  modalImagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  modalSmallImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    resizeMode: 'cover',
  },
  typingContainer: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  typingText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  connectionStatus: {
    backgroundColor: '#fff3cd',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#ffeaa7',
  },
  connectionText: {
    fontSize: 12,
    color: '#856404',
    textAlign: 'center',
  },
});

export default MayaChat;
