import { CLOUD_FUNCTIONS_BASE_URL } from '../config/constants';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebaseConfig';
import * as FileSystem from 'expo-file-system';
import i18n from '../i18n';

// Response interfaces
interface OpenAIResponse {
  text?: string;
  error?: string;
}

interface APIError {
  message: string;
  code?: string;
  status?: number;
}

interface ImageAnalysisResponse {
  result?: string;
  error?: string;
}

interface RelevanceJobResponse {
  conversation_id: string;
  job_info: {
    studio_id: string;
    job_id: string;
  };
  agent_id: string;
  state: string;
}

interface RelevancePollResponse {
  type: string;
  updates: Array<{
    type: string;
    output: {
      status: string;
      output: {
        answer: string;
      };
    };
  }>;
}

interface ChatResponse {
  message?: {
    content: string;
    role: string;
  };
  error?: string;
}

/**
 * API service class for handling all cloud function calls
 */
class APIService {
  private static baseURL = CLOUD_FUNCTIONS_BASE_URL;
  private static POLL_INTERVAL = 2000; // 2 seconds
  private static MAX_POLL_ATTEMPTS = 30; // Maximum 1 minute of polling



  /**
   * Uploads an image to Firebase Storage and returns the download URL
   * @param uri - Local URI of the image
   * @returns Promise<string> - Download URL of the uploaded image
   */
  static async uploadImageAsync(uri: string): Promise<string> {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();

      const filename = uri.substring(uri.lastIndexOf('/') + 1);
      const storageRef = ref(storage, `images/${filename}`);

      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      return downloadURL;
    } catch (error: any) {
      console.error("Error uploading image:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);
      console.error("Error serverResponse:", error.serverResponse);
      console.error("Full error object:", JSON.stringify(error, null, 2));
      throw error;
    }
  }

  /**
   * Analyzes an image using OpenAI Vision API and Relevance.ai
   * @param imageUrl - Public URL of the image to analyze
   * @returns Promise<ImageAnalysisResponse>
   */
  static async analyzeImage(imageUrl: string): Promise<any> {
    try {
      // Get current locale using the same pattern as in signup.tsx
      let locale = 'en';
      if (i18n.locale.startsWith('fr')) {
        locale = 'fr';
      } else if (i18n.locale.startsWith('es')) {
        locale = 'es';
      }

      // Log for debugging
      console.log('CLIENT: Using locale for analysis:', locale);
      console.log('CLIENT: Raw i18n.locale value:', i18n.locale);

      // Call the OpenAI Vision API
      // Also add locale as a query parameter for redundancy
      const response = await fetch(`${this.baseURL}/analyzeImage?locale=${locale}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageUrl, locale }),
      });

      const data = await response.json();
      console.log("Vision data:", data);

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error("Error analyzing image:", error);
      console.log("Error:", error);
      throw error;
    }
  }

  /**
   * Calls OpenAI API through Cloud Functions
   * @param prompt - The prompt to send to OpenAI
   * @returns Promise<OpenAIResponse>
   */
  static async callOpenAI(prompt: string): Promise<OpenAIResponse> {
    try {
      const response = await fetch(`${this.baseURL}/callOpenAI`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseText = await response.text();
      console.log("Raw OpenAI Response:", responseText);

      return { text: responseText };
    } catch (error) {
      console.error("Error calling OpenAI:", error);
      const apiError: APIError = {
        message: error instanceof Error ? error.message : "Unknown error occurred",
      };
      return { error: apiError.message };
    }
  }

  /**
   * Sends chat messages to OpenAI and returns the response
   * @param messages - Array of message objects with role and content
   * @returns Promise<ChatResponse>
   */
  static async chat(messages: Array<{ role: string; content: string }>): Promise<ChatResponse> {
    try {
      const response = await fetch(`${this.baseURL}/chatWithGPT`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Error in chat:", error);
      const apiError: APIError = {
        message: error instanceof Error ? error.message : "Unknown error occurred",
      };
      return { error: apiError.message };
    }
  }
}

export default APIService;
