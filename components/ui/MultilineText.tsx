import { StyleSheet, Text, View } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { RFValue } from "react-native-responsive-fontsize";

interface MultilineTextProps {
  line1: string;
  line2?: string;
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  letterSpacing?: "tight" | "normal";
  style?: any;
  isLight?: boolean;
}

export function MultilineText({
  line1,
  line2,
  fontSize = 38,
  fontFamily = "Aeonik-Regular",
  lineHeight = 34,
  letterSpacing = "normal",
  style,
  isLight = false,
}: MultilineTextProps) {
  const getLetterSpacing = (spacing: "tight" | "normal") => {
    return spacing === "tight" ? -1.5 : 0;
  };

  const styles = StyleSheet.create({
    container: {
      alignItems: "center",
    },
    text: {
      fontFamily: fontFamily,
      fontSize: RFValue(fontSize),
      textAlign: "center",
      paddingHorizontal: 0,
      lineHeight: lineHeight,
      letterSpacing: getLetterSpacing(letterSpacing),
    },
    line1: {
      color: "#FFFFFF",
      opacity: isLight ? 0.8 : 1,
    },
    line2: {
      color: "#FFFFFF",
      opacity: isLight ? 0.8 : 1,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={[styles.text, styles.line1, style]}>{line1}</Text>
      {line2 && <Text style={[styles.text, styles.line2, style]}>{line2}</Text>}
    </View>
  );
}
