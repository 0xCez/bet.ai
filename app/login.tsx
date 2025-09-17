import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
} from "react-native";
import { Link, router } from "expo-router";
import { ScreenBackground } from "../components/ui/ScreenBackground";
import Icon from "react-native-vector-icons/FontAwesome";
import { Logo } from "../components/ui/Logo";
import { GradientText } from "../components/ui/GradientText";
import { BorderButton } from "../components/ui/BorderButton";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import i18n from "../i18n";
// Import Google Sign-In for Android only
import { MultilineText } from "@/components/ui/MultilineText";

// Conditionally import GoogleSignin only on Android
const GoogleSignin =
  Platform.OS === "android"
    ? require("@react-native-google-signin/google-signin").GoogleSignin
    : null;

import {
  getAuth,
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
    // Uses the client ID with certificate_hash from google-services.json
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

  // Use Expo Google auth for iOS only
  const [request, response, promptAsync] = Google.useAuthRequest({
    // androidClientId: "133991312998-7ha5g8jdfvm4cgcvabhhhmiqhd5t98i5.apps.googleusercontent.com",
    androidClientId:
      "133991312998-qeusullp88no21g2189pp73k1vrmskhg.apps.googleusercontent.com",
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
      <Image
        source={require("../assets/images/bglogin2.png")}
        style={styles.bgImage}
      />

      <View style={styles.header}>
        <Logo size="medium" />
      </View>
      <View style={styles.container}>
        <View style={styles.content}>
          <MultilineText
            line1={i18n.t("loginAiPicks")}
            line2={i18n.t("loginYouPlace")}
            fontSize={26}
            fontFamily="Aeonik-Medium"
          />

          <Text style={styles.subtitle}>{i18n.t("loginCreateOrLogin")}</Text>

          <View style={styles.buttonContainer}>
            {Platform.OS === "ios" && (
              <BorderButton
                borderColor="#0D1B21"
                backgroundColor="#0D1B21"
                onPress={handleAppleSignIn}
                disabled={isAppleLoading || isGoogleLoading}
              >
                {isAppleLoading ? (
                  <ActivityIndicator color="#FFFFFF" style={styles.icon} />
                ) : (
                  <Icon
                    name="apple"
                    size={24}
                    color="#FFFFFF"
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
              borderColor="#0D1B21"
              backgroundColor="#0D1B21"
              onPress={handleGoogleSignIn}
              disabled={isGoogleLoading || isAppleLoading}
            >
              {isGoogleLoading ? (
                <ActivityIndicator color="#FFFFFF" style={styles.icon} />
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
          </View>

          <View style={styles.bottomContainer}>
            <Text style={styles.footerText}>{i18n.t("loginByContinuing")}</Text>
            <View style={styles.linksContainer}>
              <Link
                href="https://betaiapp.com/privacy.html"
                style={styles.link}
              >
                {i18n.t("loginPrivacyPolicy")}
              </Link>
              <Text style={styles.footerText}> & </Text>
              <Link href="https://betaiapp.com/terms.html" style={styles.link}>
                {i18n.t("loginTermsAndConditions")}
              </Link>
            </View>
          </View>
        </View>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  bgImage: {
    position: "absolute",
    top: -130,
    left: 0,
    right: 0,
    padding: 0,
    width: "100%",
    height: "100%",
    transform: [{ scale: 1.2 }],
    resizeMode: "contain",
  },
  container: {
    flex: 1,
    padding: 25,
    paddingBottom: 25,
  },
  header: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  logo: {
    fontSize: 32,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  content: {
    flex: 2,
    gap: 5,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  title: {
    fontSize: 32,
    color: "#FFFFFF",
    paddingHorizontal: 20,
    marginBottom: 10,
    textAlign: "center",
    fontFamily: "Aeonik-Medium",
  },
  subtitle: {
    fontSize: 16,
    color: "#FFFFFF",
    paddingHorizontal: 40,
    marginBottom: 10,
    textAlign: "center",
    fontFamily: "Aeonik-Light",
    marginTop: 10,
    letterSpacing: 1,
  },
  buttonContainer: {
    width: "100%",
    marginTop: 20,
    gap: 16,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333333",
  },
  googleButton: {
    backgroundColor: "#FFFFFF",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "Aeonik-Medium",
    fontWeight: "500",
    marginLeft: 8,
  },
  googleButtonText: {
    color: "#000000",
  },
  icon: {
    width: 24,
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginTop: 40,
    paddingHorizontal: 20,
  },
  footerText: {
    color: "#FFFFFF",
    opacity: 0.8,
    fontSize: 12,
    textAlign: "center",
  },
  linksContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  link: {
    color: "#00C2E0",
    fontSize: 12,
    fontFamily: "Aeonik-Bold",
    textDecorationLine: "none",
  },
  bottomContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 25,
  },
  googleLogo: {
    width: 24,
    height: 24,
    marginRight: 8,
  },
});
