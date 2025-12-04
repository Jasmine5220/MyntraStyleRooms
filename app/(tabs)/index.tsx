
// export default function HomeScreen() {
//   return (
//     <ParallaxScrollView
//       headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
//       headerImage={
//         <Image
//           source={require('@/assets/images/partial-react-logo.png')}
//           style={styles.reactLogo}
//         />
//       }>
//       <ThemedView style={styles.titleContainer}>
//         <ThemedText type="title">Welcome!</ThemedText>
//         <HelloWave />
//       </ThemedView>
//       <ThemedView style={styles.stepContainer}>
//         <ThemedText type="subtitle">Step 1: Try it</ThemedText>
//         <ThemedText>
//           Edit <ThemedText type="defaultSemiBold">app/(tabs)/index.tsx</ThemedText> to see changes.
//           Press{' '}
//           <ThemedText type="defaultSemiBold">
//             {Platform.select({
//               ios: 'cmd + d',
//               android: 'cmd + m',
//               web: 'F12',
//             })}
//           </ThemedText>{' '}
//           to open developer tools.
//         </ThemedText>
//       </ThemedView>
//       <ThemedView style={styles.stepContainer}>
//         <Link href="/modal">
//           <Link.Trigger>
//             <ThemedText type="subtitle">Step 2: Explore</ThemedText>
//           </Link.Trigger>
//           <Link.Preview />
//           <Link.Menu>
//             <Link.MenuAction title="Action" icon="cube" onPress={() => alert('Action pressed')} />
//             <Link.MenuAction
//               title="Share"
//               icon="square.and.arrow.up"
//               onPress={() => alert('Share pressed')}
//             />
//             <Link.Menu title="More" icon="ellipsis">
//               <Link.MenuAction
//                 title="Delete"
//                 icon="trash"
//                 destructive
//                 onPress={() => alert('Delete pressed')}
//               />
//             </Link.Menu>
//           </Link.Menu>
//         </Link>

//         <ThemedText>
//           {`Tap the Explore tab to learn more about what's included in this starter app.`}
//         </ThemedText>
//       </ThemedView>
//       <ThemedView style={styles.stepContainer}>
//         <ThemedText type="subtitle">Step 3: Get a fresh start</ThemedText>
//         <ThemedText>
//           {`When you're ready, run `}
//           <ThemedText type="defaultSemiBold">npm run reset-project</ThemedText> to get a fresh{' '}
//           <ThemedText type="defaultSemiBold">app</ThemedText> directory. This will move the current{' '}
//           <ThemedText type="defaultSemiBold">app</ThemedText> to{' '}
//           <ThemedText type="defaultSemiBold">app-example</ThemedText>.
//         </ThemedText>
//       </ThemedView>
//     </ParallaxScrollView>
//   );
// }

// const styles = StyleSheet.create({
//   titleContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     gap: 8,
//   },
//   stepContainer: {
//     gap: 8,
//     marginBottom: 8,
//   },
//   reactLogo: {
//     height: 178,
//     width: 290,
//     bottom: 0,
//     left: 0,
//     position: 'absolute',
//   },
// });


import { invitationAPI, roomAPI } from '@/services/api';
import { DancingScript_400Regular, DancingScript_700Bold, useFonts } from '@expo-google-fonts/dancing-script';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Token management function
const getStoredToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem('auth_token');
  } catch (error) {
    console.error('Error getting stored token:', error);
    return null;
  }
};

interface Room {
  _id: string;
  name: string;
  lastMessage?: string;
  memberCount: number;
  status: 'joined' | 'invited' | 'accepted';
  lastActivity: string;
  invitedBy?: string;
  memberAvatars: string[];
  acceptedAt?: Date;
  emoji?: string;
  description?: string;
  isPrivate?: boolean;
  invitationId?: string;
  invitationMessage?: string;
  owner?: {
    _id: string;
    name: string;
    email: string;
    profileImage?: string;
  };
  members?: Array<{
    userId: {
      _id: string;
      name: string;
      email: string;
      profileImage?: string;
    };
    role: 'Owner' | 'Editor' | 'Contributor' | 'Viewer';
    joinedAt: string;
  }>;
}

const mockRooms: Room[] = [
  // Invited Rooms
  {
    _id: '1',
    name: 'College Freshers Party',
    lastMessage: 'Richa: Hey! Check out this cute top I found',
    memberCount: 12,
    status: 'invited',
    lastActivity: '2 mins ago',
    invitedBy: 'Richa',
    memberAvatars: [
      'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face'
    ]
  },
  {
    _id: '2',
    name: 'Wedding Shopping',
    lastMessage: 'AI: Elegant lehenga suggestions under ₹15K',
    memberCount: 8,
    status: 'invited',
    lastActivity: '5 mins ago',
    invitedBy: 'Priya',
    memberAvatars: [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face'
    ]
  },
  // Joined Rooms
  {
    _id: '3',
    name: 'Family Wedding',
    lastMessage: 'Mom: The saree looks perfect!',
    memberCount: 25,
    status: 'joined',
    lastActivity: '30 mins ago',
    invitedBy: undefined,
    memberAvatars: [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&h=150&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&h=150&fit=crop&crop=face'
    ]
  },
  {
    _id: '4',
    name: 'Friends Reunion',
    lastMessage: 'Sarah: Can\'t wait to see everyone!',
    memberCount: 18,
    status: 'joined',
    lastActivity: '1 hour ago',
    invitedBy: undefined,
    memberAvatars: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=150&h=150&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1507591064344-4c6ce005b128?w=150&h=150&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face'
    ]
  },
  {
    _id: '5',
    name: 'Work Conference',
    lastMessage: 'AI: Professional business attire',
    memberCount: 7,
    status: 'joined',
    lastActivity: '2 hours ago',
    invitedBy: undefined,
    memberAvatars: [
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face',
      'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face'
    ]
  },
];

export default function HomeScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'joined' | 'invited'>('all');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [invitationLink, setInvitationLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  let [fontsLoaded] = useFonts({
    DancingScript_400Regular,
    DancingScript_700Bold,
  });

  // Fetch rooms from API
  const fetchRooms = async (search?: string) => {
    try {
      setLoading(true);
      
      // Check if user is authenticated before making API call
      const token = await getStoredToken();
      if (!token) {
        console.log('No authentication token, using mock data');
        setRooms(mockRooms);
        return;
      }
      
      // Fetch both rooms and invitations in parallel
      const [roomsResponse, invitationsResponse] = await Promise.all([
        roomAPI.getAll({ 
          search: search || searchQuery,
          limit: 50 
        }),
        invitationAPI.getPending()
      ]);
      
      let allRooms: Room[] = [];
      
      // Process joined rooms
      if (roomsResponse.status === 'success') {
        const joinedRooms = roomsResponse.data.rooms.map((room: any) => ({
          _id: room._id,
          name: room.name,
          lastMessage: room.lastMessage || 'No messages yet',
          memberCount: room.memberCount || room.members?.length || 0,
          status: 'joined' as const,
          lastActivity: formatLastActivity(room.lastActivity || room.updatedAt),
          memberAvatars: generateMemberAvatars(room.members || []),
          emoji: room.emoji || '👗',
          description: room.description,
          isPrivate: room.isPrivate,
          owner: room.owner,
          members: room.members
        }));
        allRooms = [...joinedRooms];
      }
      
      // Process invited rooms
      if (invitationsResponse.status === 'success') {
        const invitedRooms = invitationsResponse.data.invitations.map((invitation: any) => ({
          _id: invitation.room._id,
          name: invitation.room.name,
          lastMessage: 'You have a pending invitation',
          memberCount: invitation.room.members?.length || invitation.room.memberCount || 0,
          status: 'invited' as const,
          lastActivity: formatLastActivity(invitation.createdAt),
          invitedBy: invitation.inviter.name,
          memberAvatars: generateMemberAvatars(invitation.room.members || []),
          emoji: invitation.room.emoji || '👗',
          description: invitation.room.description,
          isPrivate: invitation.room.isPrivate,
          invitationId: invitation._id,
          invitationMessage: invitation.message
        }));
        allRooms = [...allRooms, ...invitedRooms];
      }
      
      // For authenticated users, do NOT show mock rooms when there are none.
      // If the API returned no rooms or invitations, set an empty list.
      setRooms(allRooms);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      // Fallback to mock data
      setRooms(mockRooms);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Format last activity time
  const formatLastActivity = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} mins ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hours ago`;
    return `${Math.floor(diffInMinutes / 1440)} days ago`;
  };

  // Generate member avatars from room members
  const generateMemberAvatars = (members: any[]): string[] => {
    return members.slice(0, 3).map((member, index) => {
      // Use actual profile image if available
      if (member.userId?.profileImage) {
        return member.userId.profileImage;
      }
      
      // Fallback to default avatar based on member index for consistency
      const defaultAvatars = [
        'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face'
      ];
      
      return defaultAvatars[index] || defaultAvatars[0];
    });
  };

  // Generate a deterministic room image URL so each room has its own photo
  const getRoomImageUrl = (room: Room): string => {
    const seed = (room._id || (room as any).id || room.name || 'room').toString().replace(/\s+/g, '-');
    // picsum provides stable images per seed; size kept small for list thumbnails
    return `https://picsum.photos/seed/${encodeURIComponent(seed)}/80`;
  };

  // Load rooms on component mount
  useEffect(() => {
    fetchRooms();
  }, []);

  // Refresh rooms when screen comes into focus (e.g., returning from settings)
  useFocusEffect(
    React.useCallback(() => {
      fetchRooms();
    }, [])
  );

  // Handle search
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    fetchRooms(query);
  };

  // Handle refresh
  const handleRefresh = () => {
    setRefreshing(true);
    fetchRooms();
  };

  const handleAcceptInvitation = async (roomId: string, invitationId?: string) => {
    try {
      if (invitationId) {
        // Use invitation API to accept
        await invitationAPI.accept(invitationId);
      } else {
        // Fallback to room API
        await roomAPI.join(roomId);
      }
      
      setRooms(prevRooms => 
        prevRooms.map(room => 
          room._id === roomId 
            ? { ...room, status: 'accepted' as const, invitedBy: undefined, acceptedAt: new Date() }
            : room
        )
      );
      Alert.alert('Success', 'Successfully joined the room!');
    } catch (error) {
      console.error('Error joining room:', error);
      Alert.alert('Error', 'Failed to join room. Please try again.');
    }
  };

  const handleDeclineInvitation = async (roomId: string, invitationId?: string) => {
    try {
      if (invitationId) {
        // Use invitation API to decline
        await invitationAPI.decline(invitationId);
      }
      
      setRooms(prevRooms => 
        prevRooms.filter(room => room._id !== roomId)
      );
      Alert.alert('Success', 'Invitation declined');
    } catch (error) {
      console.error('Error declining invitation:', error);
      Alert.alert('Error', 'Failed to decline invitation. Please try again.');
    }
  };

  const handleJoinRoom = async () => {
    if (!invitationLink.trim()) {
      Alert.alert('Error', 'Please enter an invitation link');
      return;
    }

    try {
      // Extract room ID and token from invitation link
      const url = new URL(invitationLink);
      const roomId = url.searchParams.get('roomId');
      const token = url.searchParams.get('token');

      if (!roomId || !token) {
        Alert.alert('Error', 'Invalid invitation link');
        return;
      }

      await roomAPI.joinViaInvitation(roomId, token);
      Alert.alert('Success', 'Successfully joined the room!');
      setInvitationLink('');
      fetchRooms(); // Refresh rooms list
    } catch (error) {
      console.error('Error joining room via invitation:', error);
      Alert.alert('Error', 'Failed to join room. The invitation link may be invalid or expired.');
    }
  };

  const filteredRooms = rooms.filter(room => {
    const matchesSearch = room.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeTab === 'all') return matchesSearch;
    if (activeTab === 'joined') return matchesSearch && (room.status === 'joined' || room.status === 'accepted');
    if (activeTab === 'invited') return matchesSearch && room.status === 'invited';
    return matchesSearch;
  }).sort((a, b) => {
    // Custom ordering for 'all' tab: invited first, then accepted, then joined
    if (activeTab === 'all') {
      const statusOrder = { 'invited': 0, 'accepted': 1, 'joined': 2 };
      const aOrder = statusOrder[a.status];
      const bOrder = statusOrder[b.status];
      
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      
      // Within same status, sort by acceptedAt for accepted rooms (most recent first)
      if (a.status === 'accepted' && b.status === 'accepted') {
        return (b.acceptedAt?.getTime() || 0) - (a.acceptedAt?.getTime() || 0);
      }
    }
    
    return 0;
  });

  // Check if fonts are loaded after all hooks
  if (!fontsLoaded) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="white" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E91E63" />
          <Text style={styles.loadingText}>Loading fonts...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="white" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E91E63" />
          <Text style={styles.loadingText}>Loading rooms...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const renderRoom = ({ item }: { item: Room }) => (
    <View style={styles.roomCard}>
      {item.status === 'invited' && (
        <Text style={styles.invitedText}>{item.invitedBy} invited you to:</Text>
      )}
      <View style={styles.roomHeader}>
        <View style={styles.roomInfo}>
          <Text style={styles.roomName}>{item.name}</Text>
          <View style={styles.memberSection}>
            <View style={styles.avatarGroup}>
              <View style={[styles.avatar, styles.avatar1]} />
              <View style={[styles.avatar, styles.avatar2]} />
              <View style={[styles.avatar, styles.avatar3]} />
            </View>
            <Text style={styles.memberCount}>{item.memberCount}+ members</Text>
          </View>
        </View>
        {item.status === 'invited' && (
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.acceptButton}>
              <Ionicons name="checkmark" size={16} color="white" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.declineButton}>
              <Ionicons name="close" size={16} color="white" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}  >
      <StatusBar barStyle="dark-content" backgroundColor="white" />
      <View style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoSection}>
            <Image 
              source={require('@/assets/images/icon.webp')} 
              style={styles.logo}
              contentFit="contain"
            />
            <Text style={styles.title}>Fashion Rooms</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.createButton}
              onPress={() => router.push('/room/create')}
            >
              <Ionicons name="add" size={14} color="#E91E63" />
              <Text style={styles.createButtonText}>Create</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.notificationButton}>
              <Ionicons name="notifications-outline" size={18} color="#000000" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={12} color="#999" />
           <TextInput
             style={styles.searchInput}
              placeholder="Search rooms"
             value={searchQuery}
             onChangeText={handleSearch}
             placeholderTextColor="#999"
           />
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'all' && styles.activeTab]}
            onPress={() => setActiveTab('all')}
          >
            <Text style={[styles.tabText, activeTab === 'all' && styles.activeTabText]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'joined' && styles.activeTab]}
            onPress={() => setActiveTab('joined')}
          >
            <Text style={[styles.tabText, activeTab === 'joined' && styles.activeTabText]}>Joined</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'invited' && styles.activeTab]}
            onPress={() => setActiveTab('invited')}
          >
            <Text style={[styles.tabText, activeTab === 'invited' && styles.activeTabText]}>Invited</Text>
          </TouchableOpacity>
        </View>

        {/* Join Room Section */}
        <LinearGradient
          colors={['#FF6B35', '#E91E63']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.joinRoomCard}
        >
          <Text style={styles.joinRoomTitle}>Join a Room</Text>
          <View style={styles.joinRoomInput}>
            <Ionicons name="link" size={12} color="white" />
            <TextInput
              style={styles.joinRoomTextInput}
              placeholder="Paste Invitation Link"
              placeholderTextColor="rgba(255,255,255,0.7)"
              value={invitationLink}
              onChangeText={setInvitationLink}
            />
            <TouchableOpacity 
              style={styles.joinRoomButton}
              onPress={handleJoinRoom}
            >
              <Ionicons name="arrow-forward" size={12} color="white" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Rooms List */}
        <ScrollView 
          style={styles.scrollView} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#E91E63"
            />
          }
        >
          {rooms.length === 0 ? (
            <View style={styles.emptyListContainer}>
              <Text style={styles.joinRoomTitle}>No rooms yet</Text>
              <Text style={styles.emptyListSubtitle}>Create a room or accept an invite to get started.</Text>
              <TouchableOpacity 
                style={styles.emptyActionButton}
                onPress={() => router.push('/room/create')}
              >
                <Text style={styles.emptyActionButtonText}>Create a room</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredRooms.map((item, index) => (
            <TouchableOpacity 
              key={item._id || `room-${index}`} 
              style={styles.roomCard}
              onPress={() => {
                if (item.status === 'invited') {
                  Alert.alert(
                    'Pending Invitation',
                    `You have a pending invitation to join "${item.name}". Please accept or decline the invitation first.`,
                    [{ text: 'OK' }]
                  );
                  return;
                }
                router.push(`/room/${item._id}`);
              }}
            >
              {item.status === 'invited' && (
                <Text style={styles.invitedText}>{item.invitedBy} invited you to:</Text>
              )}
              <View style={styles.roomHeader}>
                <Image
                  source={{ uri: getRoomImageUrl(item) }}
                  style={styles.roomThumbnail}
                  contentFit="cover"
                />
                <View style={styles.roomInfo}>
                  <Text style={styles.roomName}>{item.name}</Text>
                  <View style={styles.memberSection}>
                    <View style={styles.avatarGroup}>
                      {item.memberAvatars.slice(0, 3).map((avatar, index) => (
                        <Image
                          key={index}
                          source={{ uri: avatar }}
                          style={[styles.avatar, { marginLeft: index > 0 ? -8 : 0 }]}
                        />
                      ))}
                      {item.memberCount > 3 && (
                        <View style={[styles.avatar, styles.avatarOverflow, { marginLeft: -8 }]}>
                          <Text style={styles.avatarOverflowText}>+{item.memberCount - 3}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.memberCount}>{item.memberCount} members</Text>
                  </View>
                  <Text style={styles.lastMessage}>{item.lastMessage}</Text>
                </View>
                <View style={styles.roomRight}>
                  {item.status === 'invited' && (
                    <View style={styles.actionButtons}>
                      <TouchableOpacity 
                        style={styles.acceptButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleAcceptInvitation(item._id, item.invitationId);
                        }}
                      >
                        <Ionicons 
                          name="checkmark" 
                          size={14} 
                          color="#4CAF50" 
                        />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.declineButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          handleDeclineInvitation(item._id, item.invitationId);
                        }}
                      >
                        <Ionicons 
                          name="close" 
                          size={14} 
                          color="#F44336" 
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                  <Text style={styles.timeStamp}>
                    {item.status === 'accepted' && item.acceptedAt 
                      ? 'Just accepted' 
                      : item.lastActivity
                    }
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
            ))
          )}
        </ScrollView>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  logoSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 28,
    height: 28,
    marginRight: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    fontFamily: 'DancingScript_400Regular',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E91E63',
    backgroundColor: 'white',
    gap: 3,
  },
  createButtonText: {
    color: '#E91E63',
    fontSize: 12,
    fontWeight: '600',
  },
  notificationButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1a1a1a',
  },
  tabsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    flex: 1,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 1,
    borderBottomColor: '#E91E63',
  },
  tabText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '300',
  },
  activeTabText: {
    color: '#E91E63',
    fontWeight: '400',
  },
  joinRoomCard: {
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  joinRoomTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  joinRoomInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  joinRoomTextInput: {
    flex: 1,
    color: 'white',
    fontSize: 12,
  },
  joinRoomButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 4,
    padding: 4,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  emptyListContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyListSubtitle: {
    color: '#666',
    fontSize: 12,
    marginTop: 6,
  },
  emptyActionButton: {
    marginTop: 12,
    backgroundColor: '#FF6FA3',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 6,
  },
  emptyActionButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  roomCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  invitedText: {
    fontSize: 10,
    color: '#E91E63',
    marginBottom: 6,
    fontWeight: '500',
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  roomThumbnail: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EEEEEE',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  roomInfo: {
    flex: 1,
    marginRight: 8,
  },
  roomName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  memberSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  avatarGroup: {
    flexDirection: 'row',
  },
  avatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'white',
  },
  avatar1: {
    backgroundColor: '#FF6B35',
  },
  avatar2: {
    backgroundColor: '#E91E63',
  },
  avatar3: {
    backgroundColor: '#9C27B0',
  },
  avatar4: {
    backgroundColor: '#4CAF50',
  },
  avatar5: {
    backgroundColor: '#2196F3',
  },
  avatar6: {
    backgroundColor: '#FF9800',
  },
  avatarOverflow: {
    backgroundColor: '#E91E63',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarOverflowText: {
    color: 'white',
    fontSize: 8,
    fontWeight: '600',
  },
  memberCount: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  lastMessage: {
    fontSize: 10,
    color: '#999',
    fontWeight: '400',
    marginTop: 2,
  },
  roomRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  timeStamp: {
    fontSize: 9,
    color: '#999',
    fontWeight: '400',
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  acceptButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },

});