import { DancingScript_400Regular, DancingScript_700Bold, useFonts } from '@expo-google-fonts/dancing-script';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
    Alert,
    FlatList,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from '../contexts/auth-context';
import { useSession } from '../contexts/session-context';
import socketService from '../services/socketService';
import { wardrobeApi } from '../services/wardrobeApi';
import { getDefaultImageProps, getProductImageUri } from '../utils/imageUtils';

interface WardrobeItem {
    id: string;
    image: string;
}


type SessionStep = "wardrobe" | "notify" | "start";


export default function StartSessionScreen() {
    const { roomId: roomIdParam } = useLocalSearchParams();
    const [currentStep, setCurrentStep] = useState<SessionStep>("wardrobe");
    const [selectedWardrobe, setSelectedWardrobe] = useState<string | null>(null);
    const [notifyMembers, setNotifyMembers] = useState(true);
    const [isNotifying, setIsNotifying] = useState(false);
    const [realWardrobes, setRealWardrobes] = useState<any[]>([]);
    const [loadingWardrobes, setLoadingWardrobes] = useState(false);
    const [wardrobeItems, setWardrobeItems] = useState<{[key: string]: any[]}>({});
    const { startSession, setParticipants } = useSession();
    const { user } = useAuth();

    let [fontsLoaded] = useFonts({
        DancingScript_400Regular,
        DancingScript_700Bold,
    });

    // Load real wardrobes and convert to original UI format
    const loadRealWardrobes = async () => {
        setLoadingWardrobes(true);
        try {
            const token = await AsyncStorage.getItem('auth_token');
            if (!token) {
                console.log('No auth token found');
                setLoadingWardrobes(false);
                return;
            }

            // Get roomId from params or use default
            const currentRoomId = (roomIdParam as string) || '1';
            console.log('Loading wardrobes for room:', currentRoomId);

            const response = await wardrobeApi.getWardrobes(token, { 
                limit: 50,
                roomId: currentRoomId 
            });
            if (response.status === 'success' && response.data) {
                const wardrobesData = response.data.wardrobes;
                setRealWardrobes(wardrobesData);
                
                // Load items for each wardrobe
                const itemsPromises = wardrobesData.map(async (wardrobe: any) => {
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
                const itemsMap: {[key: string]: any[]} = {};
                itemsResults.forEach(result => {
                    itemsMap[result.wardrobeId] = result.items;
                });
                setWardrobeItems(itemsMap);
                
                console.log(`Loaded ${wardrobesData.length} wardrobes for room ${currentRoomId}`);
            } else {
                console.log('No wardrobes found for room:', currentRoomId);
                setRealWardrobes([]);
                setWardrobeItems({});
            }
        } catch (error) {
            console.error('Error loading wardrobes:', error);
            setRealWardrobes([]);
        } finally {
            setLoadingWardrobes(false);
        }
    };

    // Load wardrobes on component mount and when roomId changes
    useEffect(() => {
        loadRealWardrobes();
    }, [roomIdParam]);

    if (!fontsLoaded) {
        return null;
    }

    const handleWardrobeSelect = (wardrobeId: string) => {
        setSelectedWardrobe(wardrobeId);
        setCurrentStep("notify");
    };

    const handleNotifyMembers = () => {
        if (notifyMembers) {
            setIsNotifying(true);
            // Simulate notification process
            setTimeout(() => {
                setIsNotifying(false);
                setCurrentStep("start");
            }, 2000);
        } else {
            setCurrentStep("start");
        }
    };

    const handleStartSession = async () => {
        if (!selectedWardrobe) {
            Alert.alert('Error', 'Please select a wardrobe before starting the session');
            return;
        }
        if (!user) {
            Alert.alert('Error', 'User not authenticated');
            return;
        }
        
        const hostName = user.name;
        const hostAvatar = user.profileImage || 'https://ui-avatars.com/api/?name=' + user.name;
        const roomId = (roomIdParam as string) || '1';
        
        console.log(`🚀 Starting session in room ${roomId} by ${hostName}`);
        
        // Set up socket callbacks for session events
        socketService.updateCallbacks({
            onSessionParticipants: (participants) => {
                console.log('📥 Received session participants in start-screen:', participants);
                if (Array.isArray(participants)) {
                    const normalizedRaw = participants.map((p) => {
                        const isCurrent = user && p.userId === user._id;
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
                    // Dedupe by id keeping the first occurrence
                    const seen = new Set<string>();
                    let normalized = normalizedRaw.filter(p => {
                        if (seen.has(p.id)) return false;
                        seen.add(p.id);
                        return true;
                    });

                    // Ensure current user is present
                    const hasCurrent = normalized.some(p => p.id === user._id);
                    if (!hasCurrent) {
                        normalized = [
                            {
                                id: user._id,
                                name: user.name,
                                avatar: user.profileImage || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`,
                                isMuted: false,
                                currentProduct: null,
                            },
                            ...normalized,
                        ];
                    }
                    console.log('📥 Normalized participants in start-screen:', normalized.map(p => p.name));
                    
                    // Ensure current user is included in participants
                    const currentUserInList = normalized.find(p => p.id === user._id);
                    if (!currentUserInList) {
                        console.log('👤 Current user not in participants list, adding them');
                        normalized.push({
                            id: user._id,
                            name: user.name,
                            avatar: user.profileImage || 'https://ui-avatars.com/api/?name=' + user.name,
                            isMuted: false,
                            currentProduct: null
                        });
                    }
                    
                    // Update session context with participants (this will merge with existing participants)
                    setParticipants(normalized);
                }
            },
            // Removed onSessionState handler to satisfy types and avoid unused handler
        });
        
        // First, join the room if not already joined
        socketService.joinRoom(roomId);
        
        // Wait a bit for room join to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Join the session as host
        const userData = {
          userId: user._id,
          userName: user.name,
          avatar: user.profileImage || 'https://ui-avatars.com/api/?name=' + user.name
        };
        socketService.joinSession(roomId, userData);
        
        // Join personal room for follow notifications
        socketService.joinUser(user._id);
        
        // Then start the session via socket
        socketService.startSession(roomId, { 
            wardrobeId: selectedWardrobe, 
            host: hostName, 
            hostId: user._id,
            participants: [] // Will be populated by backend
        });
        
        // Initialize session locally without injecting current user; participants will come from server
        console.log('👤 Initializing session locally without pre-injecting user');
        startSession(roomId, [], true, selectedWardrobe);
        
        // Removed toast on session start
        // Navigate to the catalog screen for the session
        router.push("/catalog");
    };

    const handlePrevious = () => {
        if (currentStep === "notify") {
            setCurrentStep("wardrobe");
        } else if (currentStep === "start") {
            setCurrentStep("notify");
        }
    };

    const renderProgressIndicator = () => {
        const steps = [
            { key: "wardrobe", label: "Link a wardrobe", completed: currentStep !== "wardrobe" },
            { key: "notify", label: "Notify members", completed: currentStep === "start" },
            { key: "start", label: "Start a Session", completed: false },
        ];

        // Get selected wardrobe name for display
        const selectedWardrobeName = selectedWardrobe ? 
            (realWardrobes.find(w => w.id === selectedWardrobe)?.name || 'Selected Wardrobe') : 
            null;

        return (
            <View style={styles.progressContainer}>
                <View style={styles.progressTrack}>
                    {/* Connecting line */}
                    <View style={styles.progressLine} />
                    
                    {steps.map((step, index) => (
                        <View key={step.key} style={styles.stepContainer}>
                            <View
                                style={[
                                    styles.stepCircle,
                                    step.completed && styles.stepCircleCompleted,
                                    step.key === currentStep && !step.completed && styles.stepCircleActive,
                                ]}
                            >
                                {step.completed && (
                                    <Text style={styles.checkmark}>✓</Text>
                                )}
                            </View>
                            <Text
                                style={[
                                    styles.stepLabel,
                                    step.completed && styles.stepLabelCompleted,
                                    step.key === currentStep && !step.completed && styles.stepLabelActive,
                                ]}
                            >
                                {step.label}
                            </Text>
                            {/* Show selected wardrobe name under the wardrobe step */}
                            {step.key === "wardrobe" && selectedWardrobeName && (
                                <Text style={styles.selectedWardrobeName}>
                                    {selectedWardrobeName}
                                </Text>
                            )}
                        </View>
                    ))}
                </View>
            </View>
        );
    };

    const renderWardrobeItem = ({ item }: { item: any }) => {
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
                    // Don't navigate in start session, just for display
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


    const renderWardrobeCategory = ({ item, index }: { item: any; index: number }) => {
        const isEven = index % 2 === 0;
        const gradientColors = isEven 
            ? ['#F3F1FE', '#FFFFFF'] as const // Purple to white
            : ['#FFEEEC', '#FFFFFF'] as const; // Pink to white
        
        const wardrobeItemsList = wardrobeItems[item._id] || [];

        // Determine current user's role for this wardrobe
        let currentUserRole: 'Owner' | 'Editor' | 'Contributor' | 'Viewer' | null = null;
        if (user) {
            if (item.owner && (item.owner as any)._id === user._id) {
                currentUserRole = 'Owner';
            } else if (Array.isArray(item.members)) {
                const selfMember = item.members.find((m: any) => (m.userId as any)._id === user._id);
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
                    onPress={() => handleWardrobeSelect(item._id)}
                >
                    <Text style={styles.viewAllText}>Select ({wardrobeItemsList.length})</Text>
                    <Text style={styles.viewAllArrow}>›</Text>
                </TouchableOpacity>
            </LinearGradient>
        );
    };

    const renderWardrobeStep = () => {
        return (
            <View style={styles.stepContent}>
                {loadingWardrobes ? (
                    <View style={styles.loadingContainer}>
                        <Text style={styles.loadingText}>Loading wardrobes...</Text>
                    </View>
                ) : realWardrobes.length === 0 ? (
                    <View style={styles.emptyWardrobesContainer}>
                        <Text style={styles.emptyWardrobesTitle}>No Wardrobes Found</Text>
                        <Text style={styles.emptyWardrobesMessage}>
                            This room doesn't have any wardrobes yet. Create a wardrobe first to start a session.
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={realWardrobes}
                        renderItem={({ item, index }) => renderWardrobeCategory({ item, index })}
                        keyExtractor={(item) => item.id}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={styles.categoriesList}
                    />
                )}
            </View>
        );
    };

    const renderNotifyStep = () => (
        <View style={styles.stepContent}>
            <View style={styles.notifyGifContainer}>
                <Image 
                    source={require('@/assets/GIF/notify_members.gif')} 
                    style={styles.notifyGif}
                    resizeMode="contain"
                />
            </View>
            
            <View style={styles.notifyBottomSection}>
                {isNotifying ? (
                    <View style={styles.notifyingContainer}>
                        <Text style={styles.notifyingText}>Notifying members....</Text>
                    </View>
                ) : (
                    <View style={styles.checkboxSection}>
                        <TouchableOpacity
                            style={styles.checkboxContainer}
                            onPress={() => setNotifyMembers(!notifyMembers)}
                        >
                            <View style={[styles.checkbox, notifyMembers && styles.checkboxChecked]}>
                                {notifyMembers && <Text style={styles.checkmark}>✓</Text>}
                            </View>
                            <Text style={styles.checkboxLabel}>Notify members</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
            
            {!isNotifying && (
                <View style={styles.navigationButtons}>
                    <TouchableOpacity
                        style={styles.previousButton}
                        onPress={handlePrevious}
                    >
                        <Text style={styles.previousButtonText}>Previous</Text>
                    </TouchableOpacity>
                      <TouchableOpacity
                          style={styles.nextButton}
                          onPress={handleNotifyMembers}
                      >
                          <Text style={styles.nextButtonText}>Next</Text>
                      </TouchableOpacity>
                </View>
            )}
        </View>
    );

    const renderStartStep = () => (
        <View style={styles.stepContent}>
            <View style={styles.startContainer}>
                <TouchableOpacity
                    style={styles.startButton}
                    onPress={handleStartSession}
                >
                    <Text style={styles.startButtonText}>START</Text>
                </TouchableOpacity>
            </View>
            
            <View style={styles.navigationButtons}>
                <TouchableOpacity
                    style={styles.previousButton}
                    onPress={handlePrevious}
                >
                    <Text style={styles.previousButtonText}>Previous</Text>
                </TouchableOpacity>
                <View style={styles.spacer} />
            </View>
        </View>
    );

    const renderCurrentStep = () => {
        switch (currentStep) {
            case "wardrobe":
                return renderWardrobeStep();
            case "notify":
                return renderNotifyStep();
            case "start":
                return renderStartStep();
            default:
                return renderWardrobeStep();
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Text style={styles.backButtonText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.title}>Start Sessions</Text>
                <View style={styles.headerSpacer} />
            </View>

            {renderProgressIndicator()}
            {renderCurrentStep()}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "white",
    },
    header: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    backButton: {
        width: 40,
        alignItems: "flex-start",
    },
    backButtonText: {
        fontSize: 24,
        color: "#666",
        fontWeight: "300",
    },
    title: {
        fontSize: 18,
        fontWeight: "600",
        color: "#000",
        textAlign: "center",
    },
    headerSpacer: {
        width: 40,
    },
    progressContainer: {
        paddingHorizontal: 25,
        paddingVertical: 16,
    },
    progressTrack: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        position: "relative",
    },
    progressLine: {
        position: "absolute",
        top: 8,
        left: 60,
        right: 60,
        height: 1,
        backgroundColor: "#E0E0E0",
        zIndex: 1,
    },
    stepContainer: {
        alignItems: "center",
        flex: 1,
        zIndex: 2,
    },
    stepCircle: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: "#808080",
        marginBottom: 6,
    },
    stepCircleCompleted: {
        backgroundColor: "white",
        borderWidth: 2,
        borderColor: "#E91E63",
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    stepCircleActive: {
        backgroundColor: "white",
        borderWidth: 2,
        borderColor: "#E91E63",
        width: 16,
        height: 16,
        borderRadius: 8,
    },
    checkmark: {
        color: "#E91E63",
        fontSize: 8,
        fontWeight: "bold",
    },
    stepLabel: {
        fontSize: 9,
        color: "#808080",
        textAlign: "center",
    },
    stepLabelCompleted: {
        color: "#E91E63",
    },
    stepLabelActive: {
        color: "#E91E63",
        fontWeight: "600",
    },
    selectedWardrobeName: {
        fontSize: 8,
        color: "#E91E63",
        textAlign: "center",
        marginTop: 2,
        fontWeight: "500",
    },
    // Wardrobe item styles matching wardrobes screen
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
    roleBadgePurple: {
        backgroundColor: '#8B5CF6',
    },
    roleBadgePink: {
        backgroundColor: '#E91E63',
    },
    stepContent: {
        flex: 1,
    },
    categoriesList: {
        paddingVertical: 12,
        paddingBottom: 100,
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
    categoryHeader: {
        marginBottom: 16,
    },
    horizontalList: {
        marginBottom: 12,
        paddingLeft: 12,
        paddingRight: 12,
    },
    itemsList: {
        paddingRight: 12,
    },
    categoryFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
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
    roleBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        marginBottom: 10,
    },
    roleText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#fff',
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
    notifyGifContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        marginTop: 180,
    },
    notifyGif: {
        width: 500,
        height: 500,
    },
    notifyBottomSection: {
        flex: 1,
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 20,
    },
    notifyingContainer: {
        alignItems: "center",
        paddingBottom: 70,
    },
    notifyingText: {
        fontSize: 12,
        color: "#666",
        textAlign: "center",
    },
    checkboxSection: {
        alignItems: "center",
    },
    checkboxContainer: {
        flexDirection: "row",
        alignItems: "center",
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: "#E91E63",
        marginRight: 12,
        justifyContent: "center",
        alignItems: "center",
    },
    checkboxChecked: {
    },
    checkboxLabel: {
        fontSize: 12,
        color: "#333",
        fontWeight: "300",
    },
    navigationButtons: {
        flexDirection: "row",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 16,
        gap: 12,
    },
    previousButton: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "transparent",
        borderWidth: 1,
        borderColor: "#E0E0E0",
    },
    previousButtonText: {
        fontSize: 10,
        fontWeight: "400",
        color: "#666",
    },
    nextButton: {
        flex: 1,
        backgroundColor: "#E91E63",
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    nextButtonText: {
        color: "white",
        fontSize: 10,
        fontWeight: "600",
    },
    spacer: {
        flex: 1,
    },
    startContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    startButton: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: "#E91E63",
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "#E91E63",
        shadowOffset: {
            width: 0,
            height: 8,
        },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    startButtonText: {
        color: "white",
        fontSize: 18,
        fontWeight: "bold",
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 40,
    },
    loadingText: {
        fontSize: 16,
        color: '#666',
        marginTop: 10,
    },
    emptyWardrobesContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
        paddingVertical: 60,
    },
    emptyWardrobesTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginBottom: 12,
        textAlign: 'center',
    },
    emptyWardrobesMessage: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        lineHeight: 20,
    },
});
