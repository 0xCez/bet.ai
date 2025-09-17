import * as Localization from 'expo-localization';
import { I18n } from 'i18n-js';
import en from './locales/en';
import fr from './locales/fr';
import es from './locales/es';

const i18n = new I18n({
  en,
  fr,
  es,
});

// Set the locale once at the beginning of your app
i18n.locale = Localization.locale || 'en';
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

export default i18n; 