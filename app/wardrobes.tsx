import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/contexts/auth-context";
import { useSession } from "@/contexts/session-context";
import { roomAPI } from "@/services/api";
import { WardrobeItem as ApiWardrobeItem, Wardrobe, wardrobeApi } from "@/services/wardrobeApi";
import { getDefaultImageProps, getProductImageUri } from "@/utils/imageUtils";
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    ImageBackground,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface WardrobeItem {
    _id: string;
    productId: {
        _id: string;
        name: string;
        price: number;
        images?: Array<{ url: string }>;
        image?: string;
        brand: string;
        category?: string;
        description?: string;
    } | null;
    addedBy: string;
    notes: string;
    priority: string;
    reactions: Array<{
        userId: string;
        type: string;
        createdAt: string;
    }>;
}

export default function WardrobesScreen() {
    const { sessionRoomId } = useSession();
    const { user: currentUser } = useAuth();
    const { roomId } = useLocalSearchParams();
    const [searchQuery, setSearchQuery] = useState("");
    const [wardrobes, setWardrobes] = useState<Wardrobe[]>([]);
    const [loading, setLoading] = useState(true);
    const [roomName, setRoomName] = useState("Wardrobes");
    const [wardrobeItems, setWardrobeItems] = useState<{[key: string]: ApiWardrobeItem[]}>({});
    
    // Use roomId from params or sessionRoomId as fallback
    const currentRoomId = useMemo(() => {
        return (roomId as string) || sessionRoomId;
    }, [roomId, sessionRoomId]);

    const loadDefaultRoom = async () => {
        try {
            const token = await AsyncStorage.getItem('auth_token');
            if (!token) {
                setRoomName("Wardrobes");
                return;
            }

            const response = await roomAPI.getAll({ limit: 1 });
            if (response.status === 'success' && response.data.rooms.length > 0) {
                setRoomName(response.data.rooms[0].name);
            } else {
                setRoomName("Wardrobes");
            }
        } catch (error) {
            console.error('Error loading default room:', error);
            setRoomName("Wardrobes");
        }
    };

    const loadRoomName = async () => {
        if (!currentRoomId) {
            setRoomName("Wardrobes");
            return;
        }

        try {
            const token = await AsyncStorage.getItem('auth_token');
            if (!token) {
                setRoomName("Wardrobes");
                return;
            }

            const response = await roomAPI.getById(currentRoomId);
            if (response.status === 'success' && response.data) {
                setRoomName(response.data.room.name);
            } else {
                console.log('Room not found, using default name');
                setRoomName("Wardrobes");
            }
        } catch (error) {
            console.error('Error loading room name:', error);
            setRoomName("Wardrobes");
        }
    };

    const loadWardrobes = async () => {
        setLoading(true);
        try {
            const token = await AsyncStorage.getItem('auth_token');
            if (!token) {
                Alert.alert('Error', 'Please log in to view wardrobes');
                setLoading(false);
                return;
            }

            // Fetch wardrobes - filter by room if roomId is available, otherwise get all
            const response = await wardrobeApi.getWardrobes(token, {
                limit: 50,
                ...(currentRoomId && { roomId: currentRoomId })
            });
            if (response.status === 'success' && response.data) {
                const wardrobesData = response.data.wardrobes;
                setWardrobes(wardrobesData);
                
                // Load items for each wardrobe
                const itemsPromises = wardrobesData.map(async (wardrobe) => {
                    try {
                        const itemsResponse = await wardrobeApi.getWardrobeItems(token, wardrobe._id, { limit: 10 });
                        if (itemsResponse.status === 'success' && itemsResponse.data) {
                            return { wardrobeId: wardrobe._id, items: itemsResponse.data.items };
                        }
                    } catch (error) {
                        console.error(`Error loading items for wardrobe ${wardrobe._id}:`, error);
                    }
                    return { wardrobeId: wardrobe._id, items: [] };
                });
                
                const itemsResults = await Promise.all(itemsPromises);
                const itemsMap: {[key: string]: ApiWardrobeItem[]} = {};
                itemsResults.forEach(result => {
                    itemsMap[result.wardrobeId] = result.items;
                });
                setWardrobeItems(itemsMap);
            }
        } catch (error) {
            console.error('Error loading wardrobes:', error);
            Alert.alert('Error', 'Failed to load wardrobes');
        } finally {
            setLoading(false);
        }
    };

    // Memoize the load functions to prevent unnecessary re-renders
    const loadWardrobesCallback = useCallback(() => {
        loadWardrobes();
    }, [currentRoomId]);

    const loadRoomNameCallback = useCallback(() => {
        if (currentRoomId) {
            loadRoomName();
        } else {
            console.log('No roomId available, loading default room');
            loadDefaultRoom();
        }
    }, [currentRoomId]);

    // Always call hooks in the same order
    useEffect(() => {
        loadWardrobesCallback();
    }, [loadWardrobesCallback]);

    useEffect(() => {
        loadRoomNameCallback();
    }, [loadRoomNameCallback]);

    useFocusEffect(
        useCallback(() => {
            loadWardrobesCallback();
        }, [loadWardrobesCallback])
    );

    const renderWardrobeItem = ({ item }: { item: ApiWardrobeItem }) => {
        // Handle null productId
        if (!item.productId) {
            return (
                <TouchableOpacity 
                    style={styles.wardrobeItemImage}
                    onPress={() => {
                        // Don't navigate if no product
                    }}
                >
                    <Image 
                        source={{ uri: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=400&h=500&fit=crop' }} 
                        style={styles.wardrobeItemImageContent}
                        resizeMode="cover"
                    />
                    <View style={styles.itemPriceContainer}>
                        <Text style={styles.itemPrice}>₹0</Text>
                    </View>
                </TouchableOpacity>
            );
        }

        return (
            <TouchableOpacity 
                style={styles.wardrobeItemImage}
                onPress={() => {
                    router.push(`/product/${item.productId._id}`);
                }}
            >
                <Image 
                    source={{ uri: getProductImageUri(item.productId) }} 
                    style={styles.wardrobeItemImageContent}
                    resizeMode="cover"
                    {...getDefaultImageProps()}
                />
                <View style={styles.itemPriceContainer}>
                    <Text style={styles.itemPrice}>₹{item.productId.price || 0}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    const handleViewAll = (wardrobeId: string, wardrobeName: string) => {
        router.push(`/wardrobe/${wardrobeId}`);
    };

    const renderWardrobeCategory = ({ item, index }: { item: Wardrobe; index: number }) => {
        const isEven = index % 2 === 0;
        const gradientColors = isEven 
            ? ['#F3F1FE', '#FFFFFF'] as const // Purple to white
            : ['#FFEEEC', '#FFFFFF'] as const; // Pink to white
        
        const wardrobeItemsList = wardrobeItems[item._id] || [];

        // Determine current user's role for this wardrobe
        let currentUserRole: 'Owner' | 'Editor' | 'Contributor' | 'Viewer' | null = null;
        if (currentUser) {
            if (item.owner && (item.owner as any)._id === currentUser._id) {
                currentUserRole = 'Owner';
            } else if (Array.isArray(item.members)) {
                const selfMember = item.members.find(m => (m.userId as any)._id === currentUser._id);
                currentUserRole = (selfMember?.role as any) || null;
            }
        }
        const roleLabel = currentUserRole || 'Viewer';
        
        return (
            <LinearGradient
                colors={gradientColors}
                style={styles.categoryContainer}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
            >
                <View style={[
                    styles.roleBadge,
                    isEven ? styles.roleBadgePurple : styles.roleBadgePink
                ]}>
                    <Text style={styles.roleText}>{roleLabel}</Text>
                </View>
                
                <View style={styles.categoryHeader}>
                    <View style={styles.categoryInfo}>
                        <Text style={styles.categoryName}>{item.name}</Text>
                        {item.occasionType && item.occasionType !== 'General Collection' && (
                            <View style={styles.subtitleContainer}>
                                <View style={styles.aiIcon} />
                                <Text style={styles.categorySubtitle}>{item.occasionType}</Text>
                            </View>
                        )}
                    </View>
                </View>

                {wardrobeItemsList.length === 0 ? (
                    <View style={styles.emptyItemsRow}>
                        <Text style={styles.emptyItemsText}>No items yet</Text>
                    </View>
                ) : (
                    <FlatList
                        data={wardrobeItemsList}
                        renderItem={renderWardrobeItem}
                        keyExtractor={(wardrobeItem) => wardrobeItem._id}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.itemsList}
                        style={styles.horizontalList}
                    />
                )}

                <TouchableOpacity
                    style={styles.viewAllButton}
                    onPress={() => handleViewAll(item._id, item.name)}
                >
                    <Text style={styles.viewAllText}>View all ({wardrobeItemsList.length})</Text>
                    <Text style={styles.viewAllArrow}>›</Text>
                </TouchableOpacity>
            </LinearGradient>
        );
    };

    if (loading) {
        return (
            <ThemedView style={[styles.container, { backgroundColor: '#ffffff' }]}>
                <SafeAreaView style={styles.safeArea}>
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#ff6b6b" />
                        <Text style={styles.loadingText}>Loading wardrobes...</Text>
                    </View>
                </SafeAreaView>
            </ThemedView>
        );
    }

    return (
        <ThemedView style={[styles.container, { backgroundColor: '#ffffff' }]}>
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButtonContainer}>
                        <Text style={styles.backButton}>‹</Text>
                    </TouchableOpacity>
                    
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>
                            {currentRoomId ? 'Wardrobes' : 'All Wardrobes'}
                        </Text>
                        <Text style={styles.headerSubtitle}>{roomName}</Text>
                    </View>
                    
                    <TouchableOpacity 
                        style={styles.addButton}
                        onPress={() => {
                            if (currentRoomId) {
                                router.push(`/wardrobe/create?roomId=${currentRoomId}`);
                            } else {
                                Alert.alert(
                                    'Select Room', 
                                    'Please select a room first to create a wardrobe. Wardrobes are organized by rooms.',
                                    [
                                        { text: 'OK', style: 'default' }
                                    ]
                                );
                            }
                        }}
                    >
                        <Text style={styles.addButtonText}>+ Create</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.searchContainer}>
                    <View style={styles.searchInputContainer}>
                        <Ionicons name="search" size={16} style={styles.searchIcon} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search wardrobes..."
                            placeholderTextColor="#999"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>
                </View>

                <FlatList
                    data={wardrobes}
                    renderItem={renderWardrobeCategory}
                    keyExtractor={(wardrobe) => wardrobe._id}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.categoriesList}
                    ListEmptyComponent={
                        !currentRoomId ? (
                            <View style={styles.noRoomContainer}>
                                <Text style={styles.noRoomIcon}>🏠</Text>
                                <Text style={styles.noRoomTitle}>All Wardrobes</Text>
                                <Text style={styles.noRoomMessage}>
                                    Showing all wardrobes. Select a room to filter by room.
                                </Text>
                            </View>
                        ) : wardrobes.length === 0 ? (
                            <ImageBackground
                                source={{ uri: 'https://media.lordicon.com/icons/wired/lineal/1619-closet.gif' }}
                                style={styles.emptyWardrobesBg}
                                imageStyle={styles.emptyWardrobesBgImage}
                            >
                                <View style={styles.emptyWardrobesOverlay}>
                                    <Text style={styles.emptyNoWardrobesTitle}>No Wardrobes</Text>
                                    <Text style={styles.emptyNoWardrobesMessage}>
                                        No wardrobes found for this room. Create one to get started!
                                    </Text>
                                </View>
                            </ImageBackground>
                        ) : null
                    }
                />
            </SafeAreaView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    backButtonContainer: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backButton: {
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
        fontSize: 11,
        color: '#666',
        marginTop: 1,
    },
    addButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#8B5CF6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    addButtonText: {
        fontSize: 12,
        color: '#8B5CF6',
        fontWeight: '600',
    },
    searchContainer: {
        paddingHorizontal: 16,
        paddingVertical: 6,
    },
    searchInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8f8f8',
        borderRadius: 8,
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    searchIcon: {
        fontSize: 16,
        marginRight: 8,
        color: '#000',
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: '#333',
        paddingVertical: 4,
    },
    categoriesList: {
        paddingHorizontal: 0,
        paddingBottom: 16,
    },
    categoryContainer: {
        borderRadius: 0,
        marginBottom: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: 'transparent',
        shadowColor: 'transparent',
        shadowOffset: {
            width: 0,
            height: 0,
        },
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
    },
    roleBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        marginBottom: 10,
    },
    roleBadgePurple: {
        backgroundColor: '#8B5CF6',
    },
    roleBadgePink: {
        backgroundColor: '#E91E63',
    },
    roleText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#fff',
    },
    categoryHeader: {
        marginBottom: 16,
    },
    categoryInfo: {
        flex: 1,
    },
    categoryName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 2,
    },
    subtitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    aiIcon: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#ff6b6b',
        marginRight: 6,
    },
    categorySubtitle: {
        fontSize: 12,
        color: '#666',
    },
    horizontalList: {
        marginBottom: 12,
        paddingLeft: 12,
        paddingRight: 12,
    },
    itemsList: {
        paddingRight: 12,
    },
    wardrobeItemImage: {
        width: 96,
        height: 120,
        marginRight: 6,
        borderRadius: 8,
        overflow: 'hidden',
        backgroundColor: '#f0f0f0',
        position: 'relative',
    },
    wardrobeItemImageContent: {
        width: '100%',
        height: '100%',
    },
    wardrobeItemPlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#e0e0e0',
    },
    wardrobeItemText: {
        fontSize: 24,
        fontWeight: '600',
        color: '#999',
    },
    itemPriceContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    itemPrice: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '600',
        textAlign: 'center',
    },
    emptyItemsRow: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 40,
    },
    emptyItemsText: {
        fontSize: 12,
        color: '#999',
        fontStyle: 'italic',
        textAlign: 'center',
    },
    viewAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: '#f8f8f8',
        borderRadius: 6,
    },
    viewAllText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#333',
        marginRight: 2,
    },
    viewAllArrow: {
        fontSize: 12,
        color: '#666',
    },
    noRoomContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    noRoomIcon: {
        fontSize: 64,
        marginBottom: 16,
    },
    noRoomTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
        textAlign: 'center',
    },
    noRoomMessage: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        lineHeight: 24,
    },
    emptyWardrobesBg: {
        height: 400,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 60,
    },
    emptyWardrobesBgImage: {
        resizeMode: 'cover',
        opacity: 0.18,
    },
    emptyWardrobesOverlay: {
        paddingHorizontal: 24,
        paddingVertical: 16,
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.7)',
        borderRadius: 12,
    },
    emptyNoWardrobesTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 6,
        textAlign: 'center',
    },
    emptyNoWardrobesMessage: {
        fontSize: 12,
        color: '#666',
        textAlign: 'center',
        lineHeight: 18,
    },
});