import { StyleSheet } from 'react-native';

export const typography = StyleSheet.create({
  h1: {
    fontFamily: 'Aeonik-Bold',
    fontSize: 32,
    lineHeight: 40,
  },
  h2: {
    fontFamily: 'Aeonik-Bold',
    fontSize: 24,
    lineHeight: 32,
  },
  h3: {
    fontFamily: 'Aeonik-Medium',
    fontSize: 20,
    lineHeight: 28,
  },
  body: {
    fontFamily: 'Aeonik-Regular',
    fontSize: 16,
    lineHeight: 24,
  },
  bodyBold: {
    fontFamily: 'Aeonik-Bold',
    fontSize: 16,
    lineHeight: 24,
  },
  bodyLight: {
    fontFamily: 'Aeonik-Light',
    fontSize: 16,
    lineHeight: 24,
  },
  caption: {
    fontFamily: 'Aeonik-Regular',
    fontSize: 14,
    lineHeight: 20,
  },
  captionLight: {
    fontFamily: 'Aeonik-Light',
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    fontFamily: 'Aeonik-Medium',
    fontSize: 16,
    lineHeight: 24,
  },
});

// You can also create a Text component wrapper
export const createTextStyle = (
  base: keyof typeof typography,
  customStyle?: StyleSheet.NamedStyles<any>
) => {
  return [typography[base], customStyle];
}; 