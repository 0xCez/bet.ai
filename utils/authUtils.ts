import * as SecureStore from 'expo-secure-store';

export interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  provider?: string;
  lastLogin?: string;
  createdAt?: string;
  hasCompletedOnboarding?: boolean;
}

export interface AppState {
  onboardingComplete: boolean;
  signupStep: number;
  signupComplete: boolean;
  signupAnswers: { [key: number]: string };
}

const USER_KEY = 'user_auth';
const APP_STATE_KEY = 'app_state';

export const saveUserToStorage = async (user: UserData) => {
  try {
    const jsonValue = JSON.stringify(user);
    
    await SecureStore.setItemAsync(USER_KEY, jsonValue);
    
    const savedValue = await SecureStore.getItemAsync(USER_KEY);
    
  } catch (e) {
    console.error('SecureStore save error:', e);
    throw e;
  }
};

export const getUserFromStorage = async (): Promise<UserData | null> => {
  try {
    
    const jsonValue = await SecureStore.getItemAsync(USER_KEY);
    
    
    if (!jsonValue) {
      
      return null;
    }
    
    const userData = JSON.parse(jsonValue) as UserData;
    
    return userData;
  } catch (e) {
    console.error('SecureStore read error:', e);
    return null;
  }
};

export const getAppState = async (): Promise<AppState> => {
  try {
    const jsonValue = await SecureStore.getItemAsync(APP_STATE_KEY);
    
    if (!jsonValue) {
      
      return {
        onboardingComplete: false,
        signupStep: 0,
        signupComplete: false,
        signupAnswers: {},
      };
    }
    
    const parsedState = JSON.parse(jsonValue) as AppState;
    
    return parsedState;
  } catch (e) {
    console.error('AppState read error:', e);
    return {
      onboardingComplete: false,
      signupStep: 0,
      signupComplete: false,
      signupAnswers: {},
    };
  }
};

export const saveAppState = async (state: Partial<AppState>): Promise<AppState> => {
  try {
    // Get current state
    const currentState = await getAppState();
    
    // Merge with new state
    const newState: AppState = {
      ...currentState,
      ...state,
    };

    if (
      currentState.onboardingComplete === true &&
      state.onboardingComplete === false
    ) {
      console.warn("⚠️ Trying to overwrite onboardingComplete:true → false. Preventing.");
      return currentState;
    }
    
    
    // Stringify with proper typing
    const jsonValue = JSON.stringify(newState);
    
    // Save the merged state
    await SecureStore.setItemAsync(APP_STATE_KEY, jsonValue);
    
    // Add a small delay to ensure write is completed
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify the save was successful
    const savedValue = await SecureStore.getItemAsync(APP_STATE_KEY);
    if (!savedValue) {
      throw new Error('Failed to save app state - verification failed');
    }
    
    const parsedSavedValue = JSON.parse(savedValue) as AppState;
    
    // Double verification of critical fields
    if (state.onboardingComplete !== undefined && 
        parsedSavedValue.onboardingComplete !== state.onboardingComplete) {
      throw new Error('State verification failed - onboardingComplete mismatch');
    }
        
    // Return the verified state
    return parsedSavedValue;
  } catch (e) {
    console.error('AppState save error:', e);
    throw e;
  }
};

export const clearAppState = async () => {
  try {
    await SecureStore.deleteItemAsync(APP_STATE_KEY);
    // Verify deletion
    const value = await SecureStore.getItemAsync(APP_STATE_KEY);
    if (value !== null) {
      throw new Error('Failed to clear app state');
    }
  } catch (e) {
    console.error('AppState clear error:', e);
    throw e;
  }
};

export const removeUserFromStorage = async () => {
  try {
    
    await SecureStore.deleteItemAsync(USER_KEY);
    
    const value = await SecureStore.getItemAsync(USER_KEY);
    
  } catch (e) {
    console.error('SecureStore remove error:', e);
    throw e;
  }
}; 