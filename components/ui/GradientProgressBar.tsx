import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface GradientProgressBarProps {
  value: number;
  maxValue: number;
  colors?: string[];
  colorStops?: number[];
}

export function GradientProgressBar({
  value,
  maxValue,
  colors = ["#00DDFF", "#0BFF13"],
  colorStops = [1, 0.7],
}: GradientProgressBarProps) {
  const percentage = Math.min((value / maxValue) * 100, 100);

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradient}
          locations={[0, 1]}
        />
      </View>
      <View
        style={[
          styles.indicator,
          {
            left: `${percentage}%`,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    height: 5.37,
    position: "relative",
  },
  container: {
    width: "100%",
    height: 5.37,
    borderRadius: 33.59,
    overflow: "hidden",
  },
  gradient: {
    flex: 1,
  },
  indicator: {
    position: "absolute",
    top: "50%",
    width: 7.51,
    height: 7.51,
    borderRadius: 3.755,
    backgroundColor: "#f7f7f7",
    marginLeft: -3.755,
    marginTop: -3.755,
  },
});

