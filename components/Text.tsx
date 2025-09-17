import { Text as RNText, TextProps, StyleSheet } from "react-native";
import { typography } from "@/constants/theme";

interface CustomTextProps extends TextProps {
  variant?: keyof typeof typography;
  children: React.ReactNode;
}

export function Text({
  variant = "body",
  style,
  children,
  ...props
}: CustomTextProps) {
  return (
    <RNText style={[typography[variant], style]} {...props}>
      {children}
    </RNText>
  );
}
