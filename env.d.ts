declare module '@env' {
  export const API_KEY: string;
  export const AUTH_DOMAIN: string;
  export const PROJECT_ID: string;
  export const STORAGE_BUCKET: string;
  export const MESSAGING_SENDER_ID: string;
  export const APP_ID: string;
  export const MEASUREMENT_ID: string;
}

declare module '*.svg' {
  import React from 'react';
  import { SvgProps } from 'react-native-svg';
  const content: React.FC<SvgProps>;
  export default content;
}
