import { Stack } from "expo-router";

export default function StackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="loading" options={{ gestureEnabled: false }} />
      <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      <Stack.Screen name="home" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="tutorial" />
      <Stack.Screen
        name="premium-loader"
        options={{
          gestureEnabled: false,
          animation: "fade",
          animationDuration: 300,
        }}
      />
      <Stack.Screen
        name="single-prediction"
        options={{
          gestureEnabled: false,
          animation: "fade",
          animationDuration: 400,
        }}
      />
      <Stack.Screen
        name="analysis"
        options={{
          freezeOnBlur: true,
          animation: "slide_from_right",
          gestureEnabled: true,
          gestureDirection: "horizontal",
        }}
      />
      <Stack.Screen
        name="chat"
        options={{
          freezeOnBlur: true,
          animation: "slide_from_right",
          gestureEnabled: true,
          gestureDirection: "horizontal",
        }}
      />
      <Stack.Screen name="paywall" options={{ gestureEnabled: false }} />
      <Stack.Screen name="history" />
      <Stack.Screen name="+not-found"       />
      <Stack.Screen
        name="market-intel"
        options={{
          freezeOnBlur: true,
          animation: "slide_from_right",
          headerShown: false,
          gestureEnabled: true,
        }}
      />
    </Stack>
  );
}
