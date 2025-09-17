import { StyleSheet, Text } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";

interface GradientTextProps {
  children: string;
  fontSize?: number;
  fontFamily?: string;
  style?: any;
}

export function GradientText({
  children,
  fontSize = 38,
  fontFamily = "Aeonik-Regular",
  style,
}: GradientTextProps) {
  const styles = StyleSheet.create({
    title: {
      fontFamily: fontFamily,
      fontSize: fontSize,
      color: "#FFFFFF",
      textAlign: "center",
      marginBottom: 8,
      paddingHorizontal: 0,
    },
  });

  return (
    <MaskedView
      maskElement={<Text style={[styles.title, style]}>{children}</Text>}
    >
      <LinearGradient
        colors={["#ffffff", "#ffffff"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <Text style={[styles.title, style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}
