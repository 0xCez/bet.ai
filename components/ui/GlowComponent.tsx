import React, { useEffect } from 'react';
import { View, StyleSheet, Image, Platform, StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, withRepeat, withTiming, useSharedValue, withSequence, Easing } from 'react-native-reanimated';
import { colors, borderRadius } from '../../constants/designTokens';

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
          withTiming(0.9, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 1800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );

      shadowRadius.value = withRepeat(
        withSequence(
          withTiming(18, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
          withTiming(8, { duration: 1800, easing: Easing.inOut(Easing.ease) })
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
        shadowColor: colors.primary,
        shadowOffset: {
          width: 0,
          height: 0,
        },
        shadowOpacity: 0.6,
        shadowRadius: 15,
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
        shadowColor: colors.primary,
        shadowOffset: {
          width: 0,
          height: 0,
        },
        shadowOpacity: 0.8,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      }
    }),
  },
  container: {
    width: '100%',
    height: '100%',
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
