import React from "react";
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  View,
  ViewStyle,
  TextStyle,
  TouchableOpacityProps,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

interface BlackGradientButtonProps extends TouchableOpacityProps {
  containerStyle?: ViewStyle;
  textStyle?: TextStyle;
  children?: React.ReactNode;
  borderRadius?: number;
}

export function BlackGradientButton({
  containerStyle,
  textStyle,
  children,
  borderRadius = 100,
  ...props
}: BlackGradientButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, { borderRadius }, containerStyle]}
      activeOpacity={0.8}
      {...props}
    >
      <LinearGradient
        colors={["#101010", "#161616"]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        locations={[0, 0.63]}
      >
        <View style={styles.contentContainer}>
          {typeof children === "string" ? (
            <Text style={[styles.buttonText, textStyle]}>{children}</Text>
          ) : (
            children
          )}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: "100%",
    height: 60,
    overflow: "hidden",
    marginVertical: 0,
    borderWidth: 1,
    borderColor: "rgba(76, 74, 74, 0.2)", // #4C4A4A with 0.2 opacity
  },
  gradient: {
    width: "100%",
    height: "100%",
  },
  contentContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
    lineHeight: 20,
    fontFamily: "Aeonik-Medium",
  },
});
