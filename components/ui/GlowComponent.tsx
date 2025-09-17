import React, { useEffect } from 'react';
import { View, StyleSheet, Text, Dimensions, Image, Platform, StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, withRepeat, withTiming, useSharedValue, withSequence } from 'react-native-reanimated';
const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

interface GlowComponentProps {
  imageUri?: string;
  imageSource?: any; // For require() image sources
  style?: StyleProp<ViewStyle>;
  pulse?: boolean;
}

export default function GlowComponent({ imageUri, imageSource, style, pulse = true }: GlowComponentProps) {
  const shadowOpacity = useSharedValue(0.4);
  const shadowRadius = useSharedValue(5);

  useEffect(() => {
    if (pulse) {
      shadowOpacity.value = withRepeat(
        withSequence(
          withTiming(1.0, { duration: 1500 }),
          withTiming(0.3, { duration: 1500 })
        ),
        -1,
        true
      );

      shadowRadius.value = withRepeat(
        withSequence(
          withTiming(12, { duration: 1500 }),
          withTiming(3, { duration: 1500 })
        ),
        -1,
        true
      );
    }
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      shadowOpacity: shadowOpacity.value,
      shadowRadius: shadowRadius.value,
    };
  });

  return (
    <View style={[styles.outerShadowContainer, style]}>
      <Animated.View
        style={[
          styles.innerShadowContainer,
          animatedStyle
        ]}
      >
        <View style={styles.container}>
          {imageUri && (
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              resizeMode="contain"
            />
          )}
          {imageSource && (
            <Image
              source={imageSource}
              style={styles.image}
              resizeMode="contain"
            />
          )}
          {!imageUri && !imageSource && (
            <View style={{flex: 1}}/>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerShadowContainer: {
    width: '100%',
    height: '100%',
    alignSelf: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#00A7CC',
        shadowOffset: {
          width: 0,
          height: 0,
        },
        shadowOpacity: 0.8,
        shadowRadius: 10,
      },
      android: {
        elevation: 12,
      }
    }),
  },
  innerShadowContainer: {
    width: '100%',
    height: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#00C2E0',
        shadowOffset: {
          width: 0,
          height: 0,
        },
        shadowOpacity: 0.9,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      }
    }),
  },
  container: {
    width: '100%',
    height: '100%',
    borderRadius: 33,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
