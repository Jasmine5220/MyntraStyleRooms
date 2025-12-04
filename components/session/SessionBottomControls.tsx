import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface SessionBottomControlsProps {
  onScreenShare?: () => void;
  onWardrobePress?: () => void;
  onToggleMute: () => void;
  onEndCall: () => void;
  isMuted: boolean;
}

export default function SessionBottomControls({
  onScreenShare,
  onWardrobePress,
  onToggleMute,
  onEndCall,
  isMuted,
}: SessionBottomControlsProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.controlButton} onPress={onScreenShare}>
        <Ionicons name="grid-outline" size={20} color="white" />
      </TouchableOpacity>
      
      {onWardrobePress && (
        <TouchableOpacity style={styles.controlButton} onPress={onWardrobePress}>
          <Ionicons name="shirt-outline" size={20} color="white" />
        </TouchableOpacity>
      )}
      
      <TouchableOpacity 
        style={[styles.controlButton, isMuted && styles.mutedButton]} 
        onPress={onToggleMute}
      >
        <Ionicons 
          name={isMuted ? "mic-off" : "mic"} 
          size={20} 
          color="white" 
        />
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.endCallButton} onPress={onEndCall}>
        <Ionicons name="close" size={20} color="white" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#48484A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mutedButton: {
    backgroundColor: '#FF3B30', // Red when muted
  },
  endCallButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FF3B30', // Red color
    justifyContent: 'center',
    alignItems: 'center',
  },
});


