import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { ImageSourcePropType } from "react-native";

export interface ImagePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TransitionConfig {
  // Image source (URI string or require())
  imageSource: string | ImageSourcePropType;
  // Starting position (measured from source screen)
  startPosition: ImagePosition;
  // Target position on destination screen
  endPosition: ImagePosition;
  // Duration of the transition in ms
  duration?: number;
  // Border radius for the image
  borderRadius?: number;
}

interface ImageTransitionContextType {
  // Whether a transition is currently active
  isTransitioning: boolean;
  // Current transition configuration
  transitionConfig: TransitionConfig | null;
  // Start a transition with the given config
  startTransition: (config: TransitionConfig) => void;
  // Called when the transition animation completes
  completeTransition: () => void;
  // Cancel/reset the transition
  cancelTransition: () => void;
  // Store a ref to measure image position
  measureRef: React.RefObject<any>;
  // Store measured position for later use
  setMeasuredPosition: (position: ImagePosition) => void;
  // Get the stored measured position
  measuredPosition: ImagePosition | null;
}

const ImageTransitionContext = createContext<ImageTransitionContextType | undefined>(undefined);

export function ImageTransitionProvider({ children }: { children: React.ReactNode }) {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionConfig, setTransitionConfig] = useState<TransitionConfig | null>(null);
  const [measuredPosition, setMeasuredPositionState] = useState<ImagePosition | null>(null);
  const measureRef = useRef<any>(null);

  const startTransition = useCallback((config: TransitionConfig) => {
    setTransitionConfig(config);
    setIsTransitioning(true);
  }, []);

  const completeTransition = useCallback(() => {
    setIsTransitioning(false);
    // Keep config briefly for fade-out, then clear
    setTimeout(() => {
      setTransitionConfig(null);
      setMeasuredPositionState(null);
    }, 100);
  }, []);

  const cancelTransition = useCallback(() => {
    setIsTransitioning(false);
    setTransitionConfig(null);
    setMeasuredPositionState(null);
  }, []);

  const setMeasuredPosition = useCallback((position: ImagePosition) => {
    setMeasuredPositionState(position);
  }, []);

  return (
    <ImageTransitionContext.Provider
      value={{
        isTransitioning,
        transitionConfig,
        startTransition,
        completeTransition,
        cancelTransition,
        measureRef,
        setMeasuredPosition,
        measuredPosition,
      }}
    >
      {children}
    </ImageTransitionContext.Provider>
  );
}

export function useImageTransition() {
  const context = useContext(ImageTransitionContext);
  if (context === undefined) {
    throw new Error("useImageTransition must be used within an ImageTransitionProvider");
  }
  return context;
}
