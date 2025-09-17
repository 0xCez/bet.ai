import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_STATE_KEY = '@app_state';

export interface AppState {
  onboardingComplete: boolean;
  signupComplete: boolean;
  signupStep?: number;
  signupAnswers?: Record<string, any>;
}

export const defaultAppState: AppState = {
  onboardingComplete: false,
  signupComplete: false,
  signupStep: 0,
  signupAnswers: {},
};

export async function getAppState(): Promise<AppState> {
  try {
    const stateStr = await AsyncStorage.getItem(APP_STATE_KEY);
    if (!stateStr) return defaultAppState;
    return JSON.parse(stateStr);
  } catch (error) {
    console.error('Error reading app state:', error);
    return defaultAppState;
  }
}

export async function updateAppState(updates: Partial<AppState>): Promise<void> {
  try {
    const currentState = await getAppState();
    const newState = { ...currentState, ...updates };
    await AsyncStorage.setItem(APP_STATE_KEY, JSON.stringify(newState));
  } catch (error) {
    console.error('Error updating app state:', error);
  }
}

export async function clearAppState(): Promise<void> {
  try {
    await AsyncStorage.removeItem(APP_STATE_KEY);
  } catch (error) {
    console.error('Error clearing app state:', error);
  }
} 