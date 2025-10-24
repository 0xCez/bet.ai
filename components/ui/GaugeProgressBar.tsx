import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";

interface GaugeProgressBarProps {
  value: number;
  maxValue: number;
  primaryText: string;
  secondaryText: string;
}

export function GaugeProgressBar({
  value,
  maxValue,
  primaryText,
  secondaryText,
}: GaugeProgressBarProps) {
  const percentage = Math.min((value / maxValue) * 100, 100);
  const angle = (percentage / 100) * 298; // 298 degrees arc
  
  // SVG arc parameters
  const centerX = 60;
  const centerY = 60;
  const radius = 45;
  const strokeWidth = 6;
  
  // 298 degree arc with 62 degree gap at the bottom
  // Gap centered at 270° (bottom), so gap is from 239° to 301°
  // Arc starts at 211° (bottom-left) and goes clockwise 298° to 509° (= 149°, bottom-right)
  const startAngle = 211;
  const totalArc = 298;

  // Create the arc path
  const createArc = (degreeStart: number, degreeEnd: number) => {
    const start = polarToCartesian(centerX, centerY, radius, degreeStart);
    const end = polarToCartesian(centerX, centerY, radius, degreeEnd);
    const largeArcFlag = degreeEnd - degreeStart <= 180 ? "0" : "1";
    
    return [
      "M", start.x, start.y,
      "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y
    ].join(" ");
  };

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    };
  };

  // Background arc (unfilled - grey) - full 298 degree arc
  const backgroundPath = createArc(startAngle, startAngle + totalArc);
  
  // Filled arc (progress - gradient) - portion based on percentage
  const filledPath = createArc(startAngle, startAngle + angle);

  return (
    <View style={styles.container}>
      <Svg width="120" height="80" viewBox="0 0 120 80">
        {/* Background arc (unfilled - grey) - full 298 degrees */}
        <Path
          d={backgroundPath}
          stroke="#9D9D9D"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
        />
        
        {/* Filled arc (progress - cyan) - partial based on value */}
        <Path
          d={filledPath}
          stroke="#00C2E0"
          strokeWidth={strokeWidth + 2}
          fill="none"
          strokeLinecap="round"
          opacity={1}
        />
      </Svg>
      
      <View style={styles.textContainer}>
        <Text style={styles.primaryText}>{primaryText}</Text>
        <Text style={styles.secondaryText}>{secondaryText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  textContainer: {
    position: "absolute",
    top: 35,
    alignItems: "center",
    gap: 2,
  },
  primaryText: {
    fontFamily: "Aeonik-Medium",
    fontSize: 17,
    color: "#FFFFFF",
  },
  secondaryText: {
    fontFamily: "Aeonik-Medium",
    fontSize: 8,
    color: "#FFFFFF",
  },
});

