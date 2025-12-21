import React, { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import { Link, router } from "expo-router";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import Icon from "react-native-vector-icons/FontAwesome";
import { Logo } from "../components/ui/Logo";
import { BorderButton } from "../components/ui/BorderButton";
import { ConcentricCircles } from "../components/ui/ConcentricCircles";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import i18n from "../i18n";
import { MultilineText } from "@/components/ui/MultilineText";
import { colors, spacing, typography } from "../constants/designTokens";

// Conditionally import GoogleSignin only on Android
const GoogleSignin =
  Platform.OS === "android"
    ? require("@react-native-google-signin/google-signin").GoogleSignin
    : null;

import {
  signInWithCredential,
  OAuthProvider,
  GoogleAuthProvider,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRevenueCatUser } from "./hooks/useRevenueCatUser";

// Initialize Google Sign-In based on platform
if (Platform.OS === "android") {
  // Configure Google Sign-In for Android
  GoogleSignin.configure({
    // Uses the web client ID from google-services.json (Production: betai-f9176)
    webClientId:
      "133991312998-ad8jd49fdplqntsjsq5auptus8aqa32i.apps.googleusercontent.com",
    offlineAccess: true,
    forceCodeForRefreshToken: true,
  });
} else {
  // iOS: Register for expo-auth-session redirect
  try {
    WebBrowser.maybeCompleteAuthSession();
  } catch (error) {
    console.error("Error completing auth session:", error);
  }
}

const USER_STORAGE_KEY = "@user_data";

const saveUserData = async (user: any) => {
  try {
    const userData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      lastLogin: new Date().toISOString(),
      createdAt: user.metadata.creationTime || new Date().toISOString(),
      provider: user.providerData[0]?.providerId || "unknown",
    };

    await setDoc(doc(db, "users", user.uid), userData, { merge: true });
    await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
    console.log("User data saved to Firestore and AsyncStorage");
  } catch (error) {
    console.error("Error saving user data:", error);
  }
};

export default function LoginScreen() {
  const { linkUserToFirebase } = useRevenueCatUser();
  const [isGoogleLoading, setIsGoogleLoading] = React.useState(false);
  const [isAppleLoading, setIsAppleLoading] = React.useState(false);

  // Animation values
  const logoOpacity = useSharedValue(0);
  const logoTranslateY = useSharedValue(-20);
  const contentOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(30);
  const buttonsOpacity = useSharedValue(0);
  const buttonsTranslateY = useSharedValue(20);

  // Start entrance animations
  useEffect(() => {
    const timingConfig = {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    };

    // Logo animation - starts immediately
    logoOpacity.value = withTiming(1, timingConfig);
    logoTranslateY.value = withTiming(0, timingConfig);

    // Content animation - delayed
    contentOpacity.value = withDelay(200, withTiming(1, timingConfig));
    contentTranslateY.value = withDelay(200, withTiming(0, timingConfig));

    // Buttons animation - more delayed
    buttonsOpacity.value = withDelay(400, withTiming(1, timingConfig));
    buttonsTranslateY.value = withDelay(400, withTiming(0, timingConfig));
  }, []);

  // Animated styles
  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ translateY: logoTranslateY.value }],
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentTranslateY.value }],
  }));

  const buttonsAnimatedStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
    transform: [{ translateY: buttonsTranslateY.value }],
  }));

  // Use Expo Google auth for iOS only
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId:
      "133991312998-ad8jd49fdplqntsjsq5auptus8aqa32i.apps.googleusercontent.com",
    iosClientId:
      "133991312998-nsjaob5e5do67f55pd1pf3at8t1en12b.apps.googleusercontent.com",
    webClientId:
      "133991312998-ad8jd49fdplqntsjsq5auptus8aqa32i.apps.googleusercontent.com",
  });

  const handleAuthSuccess = async (firebaseUser: any) => {
    try {
      // Save user data to Firestore and storage
      await saveUserData(firebaseUser);

      // Link RevenueCat anonymous user with Firebase user
      const result = await linkUserToFirebase(firebaseUser.uid);
      if (!result.success) {
        console.error("Failed to link RevenueCat user:", result.error);
      }

      // Navigate to home
      router.replace("/home");
    } catch (error) {
      console.error("Error in auth success handler:", error);
      alert(
        "Login successful but failed to setup some services. Please try again."
      );
      // Reset loading states on error
      setIsGoogleLoading(false);
      setIsAppleLoading(false);
    }
  };

  // Handle iOS auth response
  React.useEffect(() => {
    if (Platform.OS !== "ios" || !response) return;

    if (response.type === "success") {
      console.log("Got authentication response", response);

      const idToken =
        response.authentication?.idToken || response.params?.id_token;
      const accessToken =
        response.authentication?.accessToken || response.params?.access_token;

      if (!idToken) {
        console.error("No ID token received in response");
        setIsGoogleLoading(false);
        return;
      }

      const credential = GoogleAuthProvider.credential(idToken, accessToken);

      signInWithCredential(auth, credential)
        .then((result) => {
          handleAuthSuccess(result.user);
        })
        .catch((error) => {
          console.error("Error with Google sign in:", error);
          alert(error.message);
          setIsGoogleLoading(false);
        });
    } else if (response.type === "error") {
      console.error("Auth response error:", response.error);
      alert(response.error?.message || "Authentication failed");
      setIsGoogleLoading(false);
    } else if (response.type === "cancel") {
      console.log("Authentication was canceled");
      setIsGoogleLoading(false);
    }
  }, [response]);

  // Android Google Sign-In implementation
  const signInWithGoogleOnAndroid = async () => {
    try {
      // Make sure GoogleSignin is available
      if (!GoogleSignin) {
        throw new Error("GoogleSignin is not available on this platform");
      }

      // Ensure Google Play Services is available
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });

      // Clear any previous sign-in state
      await GoogleSignin.signOut();

      console.log("Starting Google Sign-In on Android");

      // Begin sign-in process
      const userInfo = await GoogleSignin.signIn();
      console.log("Android Google Sign-In success, user info received");

      // Get the ID token for Firebase auth
      const { idToken } = await GoogleSignin.getTokens();
      console.log("Got ID token, length:", idToken ? idToken.length : 0);

      if (!idToken) {
        throw new Error("No ID token received from Google Sign-In");
      }

      console.log("Creating Firebase credential");
      // Create a Firebase credential with the token
      const credential = GoogleAuthProvider.credential(idToken);

      console.log("Signing in with Firebase");
      // Sign in to Firebase
      const result = await signInWithCredential(auth, credential);
      console.log("Firebase sign-in successful");

      // Handle successful authentication
      await handleAuthSuccess(result.user);
    } catch (error: any) {
      console.error("Android Google Sign-In error:", JSON.stringify(error));

      // Handle specific error cases with more detailed logging
      if (error.code === 12501) {
        console.log("User cancelled the sign-in flow");
      } else if (error.code === 7) {
        console.log("Play Services not available or outdated");
        alert("Google Play Services not available or outdated");
      } else {
        console.log("Error code:", error.code);
        console.log("Error message:", error.message);

        // If it's a DEVELOPER_ERROR, provide more specific guidance
        if (error.message && error.message.includes("DEVELOPER_ERROR")) {
          alert(
            "Authentication configuration error. Please check that the app's SHA-1 certificate fingerprint is registered in the Firebase console."
          );
        } else {
          alert("Google Sign-In Error: " + (error.message || "Unknown error"));
        }
      }

      setIsGoogleLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);

      if (Platform.OS === "android") {
        // Use the native Google Sign-In for Android
        await signInWithGoogleOnAndroid();
      } else if (Platform.OS === "ios") {
        // Use Expo Auth Session for iOS
        await promptAsync();
      } else {
        console.warn("Google Sign-In not implemented for this platform");
        setIsGoogleLoading(false);
      }
    } catch (error: any) {
      console.error("Error with Google sign in:", error);
      alert(error.message);
      setIsGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setIsAppleLoading(true);
      const nonce = Math.random().toString(36).substring(2, 10);
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        nonce
      );

      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      const { identityToken } = appleCredential;
      if (identityToken) {
        const provider = new OAuthProvider("apple.com");
        const credential = provider.credential({
          idToken: identityToken,
          rawNonce: nonce,
        });

        const result = await signInWithCredential(auth, credential);
        await handleAuthSuccess(result.user);
      } else {
        // No identity token received
        console.error("No identity token received from Apple");
        alert("Authentication failed. Please try again.");
        setIsAppleLoading(false);
      }
    } catch (error: any) {
      if (error.code === "ERR_CANCELED") {
        console.log("User cancelled Apple sign in");
      } else {
        console.error("Error with Apple sign in:", error);
        alert(error.message);
      }
      setIsAppleLoading(false);
    }
  };

  return (
    <ScreenBackground hideBg>
      {/* Concentric circles background */}
      <ConcentricCircles rotate rotationDuration={45000} />

      <Animated.View style={[styles.header, logoAnimatedStyle]}>
        <Logo size="medium" />
      </Animated.View>

      <View style={styles.container}>
        <View style={styles.content}>
          <Animated.View style={contentAnimatedStyle}>
            <MultilineText
              line1={i18n.t("loginAiPicks")}
              line2={i18n.t("loginYouPlace")}
              fontSize={26}
              fontFamily="Aeonik-Medium"
            />

            <Text style={styles.subtitle}>{i18n.t("loginCreateOrLogin")}</Text>
          </Animated.View>

          <Animated.View style={[styles.buttonContainer, buttonsAnimatedStyle]}>
            {Platform.OS === "ios" && (
              <BorderButton
                borderColor={colors.muted}
                backgroundColor={colors.card}
                onPress={handleAppleSignIn}
                disabled={isAppleLoading || isGoogleLoading}
              >
                {isAppleLoading ? (
                  <ActivityIndicator color={colors.foreground} style={styles.icon} />
                ) : (
                  <Icon
                    name="apple"
                    size={22}
                    color={colors.foreground}
                    style={styles.icon}
                  />
                )}
                <Text style={styles.buttonText}>
                  {isAppleLoading
                    ? i18n.t("loginSigningIn")
                    : i18n.t("loginContinueWithApple")}
                </Text>
              </BorderButton>
            )}
            <BorderButton
              borderColor={colors.muted}
              backgroundColor={colors.card}
              onPress={handleGoogleSignIn}
              disabled={isGoogleLoading || isAppleLoading}
            >
              {isGoogleLoading ? (
                <ActivityIndicator color={colors.foreground} style={styles.icon} />
              ) : (
                <Image
                  source={require("../assets/images/google.png")}
                  style={styles.googleLogo}
                  resizeMode="contain"
                />
              )}
              <Text style={styles.buttonText}>
                {isGoogleLoading
                  ? i18n.t("loginSigningIn")
                  : i18n.t("loginContinueWithGoogle")}
              </Text>
            </BorderButton>
          </Animated.View>

          <Animated.View style={[styles.bottomContainer, buttonsAnimatedStyle]}>
            <Text style={styles.footerText}>{i18n.t("loginByContinuing")}</Text>
            <View style={styles.linksContainer}>
              <Link
                href="https://betaiapp.com/privacy"
                style={styles.link}
              >
                {i18n.t("loginPrivacyPolicy")}
              </Link>
              <Text style={styles.footerText}> & </Text>
              <Link href="https://betaiapp.com/terms" style={styles.link}>
                {i18n.t("loginTermsAndConditions")}
              </Link>
            </View>
          </Animated.View>
        </View>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing[6],
    paddingBottom: spacing[6],
  },
  header: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing[5],
    paddingTop: spacing[3],
  },
  content: {
    flex: 2,
    gap: spacing[2],
    justifyContent: "flex-end",
    alignItems: "center",
  },
  subtitle: {
    fontSize: typography.sizes.base,
    color: colors.mutedForeground,
    paddingHorizontal: spacing[10],
    marginBottom: spacing[2],
    textAlign: "center",
    fontFamily: typography.fontFamily.light,
    marginTop: spacing[3],
    letterSpacing: 0.5,
  },
  buttonContainer: {
    width: "100%",
    marginTop: spacing[5],
    gap: spacing[4],
  },
  buttonText: {
    color: colors.foreground,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily.medium,
    marginLeft: spacing[2],
  },
  icon: {
    width: 24,
  },
  footerText: {
    color: colors.mutedForeground,
    fontSize: typography.sizes.xs,
    textAlign: "center",
    fontFamily: typography.fontFamily.regular,
  },
  linksContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing[1],
  },
  link: {
    color: colors.primary,
    fontSize: typography.sizes.xs,
    fontFamily: typography.fontFamily.medium,
    textDecorationLine: "none",
  },
  bottomContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing[6],
  },
  googleLogo: {
    width: 22,
    height: 22,
    marginRight: spacing[2],
  },
});
