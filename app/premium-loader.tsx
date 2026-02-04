import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  StatusBar,
  Animated as RNAnimated,
  Easing as RNEasing,
} from "react-native";
import Svg, { Circle, Rect, Path, Defs, LinearGradient as SvgLinearGradient, Stop } from "react-native-svg";
import { useLocalSearchParams, router } from "expo-router";
import { colors } from "../constants/designTokens";
import APIService from "../services/api";

// Use RN Animated for SVG elements
const RNAnimatedRect = RNAnimated.createAnimatedComponent(Rect);
const RNAnimatedPath = RNAnimated.createAnimatedComponent(Path);

// Colors
const PRIMARY = colors.primary;

// Sizing - more breathing room around the B
const LOGO_SIZE = 110;
const RING_SIZE = 240;
const RING_STROKE = 2.5;

// Minimum display time (ms)
const MIN_DISPLAY_TIME = 6000;

export default function PremiumLoaderScreen() {
  const params = useLocalSearchParams<{ imageUri: string; from?: string }>();
  const [isReady, setIsReady] = useState(false);
  const startTime = useRef(Date.now());
  const hasNavigated = useRef(false);

  // Refs for navigation data
  const analysisResultRef = useRef<any>(null);
  const imageUrlRef = useRef<string>("");

  // Animations
  const ringRotation = useRef(new RNAnimated.Value(0)).current;
  const logoOpacity = useRef(new RNAnimated.Value(0)).current;
  const logoScale = useRef(new RNAnimated.Value(0.9)).current;
  const logoPulse = useRef(new RNAnimated.Value(1)).current;

  // Logo elements stagger
  const logoElementAnims = useRef(
    Array.from({ length: 7 }, () => new RNAnimated.Value(0))
  ).current;

  useEffect(() => {
    // Ring rotation - smooth, continuous, slightly slower for elegance
    RNAnimated.loop(
      RNAnimated.timing(ringRotation, {
        toValue: 1,
        duration: 1600,
        easing: RNEasing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Logo fade in
    RNAnimated.parallel([
      RNAnimated.timing(logoOpacity, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      RNAnimated.timing(logoScale, {
        toValue: 1,
        duration: 300,
        easing: RNEasing.out(RNEasing.back(1.1)),
        useNativeDriver: true,
      }),
    ]).start();

    // Subtle logo pulse
    RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(logoPulse, {
          toValue: 1.03,
          duration: 1500,
          easing: RNEasing.inOut(RNEasing.ease),
          useNativeDriver: true,
        }),
        RNAnimated.timing(logoPulse, {
          toValue: 1,
          duration: 1500,
          easing: RNEasing.inOut(RNEasing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Logo elements stagger - tighter wave, elements overlap more
    const CYCLE_DURATION = 2000;
    const STAGGER_DELAY = 60;

    logoElementAnims.forEach((anim, index) => {
      const delay = index * STAGGER_DELAY;
      setTimeout(() => {
        const runCycle = () => {
          anim.setValue(0);
          RNAnimated.timing(anim, {
            toValue: 1,
            duration: CYCLE_DURATION,
            easing: RNEasing.linear,
            useNativeDriver: false,
          }).start(() => runCycle());
        };
        runCycle();
      }, delay);
    });

    return () => {
      logoElementAnims.forEach(anim => anim.stopAnimation());
    };
  }, []);

  // API call
  useEffect(() => {
    const fetchAnalysis = async () => {
      if (!params.imageUri) return;

      try {
        const downloadURL = await APIService.uploadImageAsync(params.imageUri);
        imageUrlRef.current = downloadURL;

        const response = await APIService.analyzeImage(downloadURL);

        if (response.error) {
          throw new Error(response.error);
        }

        if (response.status === "false" || response.status === false) {
          throw new Error(response.message || "Failed to analyze image.");
        }

        const analysisData = {
          sport: response?.sport || "",
          teams: {
            home: response?.teams?.home || "",
            away: response?.teams?.away || "",
            logos: {
              home: response?.teams?.logos?.home || "",
              away: response?.teams?.logos?.away || "",
            },
          },
          keyInsights: {
            marketConsensus: response?.keyInsightsNew?.marketConsensus || null,
            bestValue: response?.keyInsightsNew?.bestValue || null,
            offensiveEdge: response?.keyInsightsNew?.offensiveEdge || null,
            defensiveEdge: response?.keyInsightsNew?.defensiveEdge || null,
          },
          matchSnapshot: {
            recentPerformance: {
              home: response?.matchSnapshot?.recentPerformance?.home || "",
              away: response?.matchSnapshot?.recentPerformance?.away || "",
            },
            headToHead: response?.matchSnapshot?.headToHead || "",
            momentum: {
              home: response?.matchSnapshot?.momentum?.home || "",
              away: response?.matchSnapshot?.momentum?.away || "",
            },
          },
          xFactors: response?.xFactors || [],
          aiAnalysis: {
            confidenceScore: response?.aiAnalysis?.confidenceScore || "",
            bettingSignal: response?.aiAnalysis?.bettingSignal || "",
            breakdown: response?.aiAnalysis?.breakdown || "",
          },
          marketIntelligence: response?.marketIntelligence,
          teamStats: response?.teamStats,
        };

        analysisResultRef.current = analysisData;
        setIsReady(true);
      } catch (error) {
        console.error("Analysis failed:", error);
        router.back();
      }
    };

    fetchAnalysis();
  }, [params.imageUri]);

  // Navigate when ready
  useEffect(() => {
    if (isReady && !hasNavigated.current) {
      const elapsed = Date.now() - startTime.current;
      const remaining = Math.max(0, MIN_DISPLAY_TIME - elapsed);

      setTimeout(() => {
        if (!hasNavigated.current) {
          hasNavigated.current = true;
          router.replace({
            pathname: "/single-prediction",
            params: {
              analysisData: JSON.stringify(analysisResultRef.current),
              imageUrl: imageUrlRef.current,
              imageUri: params.imageUri,
              from: params.from || "scan",
            },
          });
        }
      }, remaining);
    }
  }, [isReady]);

  // Interpolations
  const ringRotationInterpolate = ringRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Smoother wave - elements overlap so B is always partially visible
  // Faster fade in, longer hold, faster fade out, minimal gap
  const getElementOpacity = (index: number) => {
    return logoElementAnims[index].interpolate({
      inputRange: [0, 0.08, 0.15, 0.75, 0.85, 1],
      outputRange: [0.15, 0.15, 1, 1, 0.15, 0.15],
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Spinning ring */}
      <RNAnimated.View
        style={[
          styles.ringContainer,
          { transform: [{ rotate: ringRotationInterpolate }] }
        ]}
      >
        <Svg width={RING_SIZE} height={RING_SIZE}>
          <Defs>
            <SvgLinearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <Stop offset="0%" stopColor={PRIMARY} stopOpacity="0" />
              <Stop offset="30%" stopColor={PRIMARY} stopOpacity="0.1" />
              <Stop offset="70%" stopColor={PRIMARY} stopOpacity="0.6" />
              <Stop offset="100%" stopColor={PRIMARY} stopOpacity="1" />
            </SvgLinearGradient>
          </Defs>
          {/* Background ring - very faint */}
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={(RING_SIZE - RING_STROKE) / 2}
            stroke={`${PRIMARY}12`}
            strokeWidth={RING_STROKE}
            fill="transparent"
          />
          {/* Gradient arc */}
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={(RING_SIZE - RING_STROKE) / 2}
            stroke="url(#ringGradient)"
            strokeWidth={RING_STROKE}
            fill="transparent"
            strokeLinecap="round"
          />
        </Svg>
      </RNAnimated.View>

      {/* B Logo */}
      <RNAnimated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoOpacity,
            transform: [
              { scale: RNAnimated.multiply(logoScale, logoPulse) }
            ],
          }
        ]}
      >
        <Svg
          width={LOGO_SIZE}
          height={LOGO_SIZE}
          viewBox="42 46 96 88"
          fill="none"
        >
          {/* Element 1 - Top bar */}
          <RNAnimatedRect
            x="64.236"
            y="50.4492"
            width="54.7445"
            height="16.1983"
            fill={PRIMARY}
            opacity={getElementOpacity(0)}
          />

          {/* Element 2 - Middle bar */}
          <RNAnimatedRect
            x="64.236"
            y="81.9009"
            width="54.7445"
            height="16.1983"
            fill={PRIMARY}
            opacity={getElementOpacity(1)}
          />

          {/* Element 3 - Bottom bar */}
          <RNAnimatedRect
            x="64.236"
            y="113.353"
            width="54.7445"
            height="16.1983"
            fill={PRIMARY}
            opacity={getElementOpacity(2)}
          />

          {/* Element 4 - Top right arrow */}
          <RNAnimatedPath
            d="M118.98 89.73V64.2177V50.7866L132.188 66.6474V81.709L125.685 89.73H118.98Z"
            fill={PRIMARY}
            opacity={getElementOpacity(3)}
          />

          {/* Element 5 - Bottom right arrow */}
          <RNAnimatedPath
            d="M118.98 89.6626V116.12V129.551L132.188 113.324V98.3337L125.632 89.6626H118.98Z"
            fill={PRIMARY}
            opacity={getElementOpacity(4)}
          />

          {/* Element 6 - Top left square */}
          <RNAnimatedRect
            x="47.8125"
            y="66.6475"
            width="16.4234"
            height="15.2534"
            fill={PRIMARY}
            opacity={getElementOpacity(5)}
          />

          {/* Element 7 - Bottom left square */}
          <RNAnimatedRect
            x="47.8125"
            y="98.0991"
            width="16.4234"
            height="15.2534"
            fill={PRIMARY}
            opacity={getElementOpacity(6)}
          />
        </Svg>
      </RNAnimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  ringContainer: {
    position: "absolute",
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  logoContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
});
