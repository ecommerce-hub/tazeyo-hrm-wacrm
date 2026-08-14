import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  // Read the locale from the environment, defaulting to 'tr'.
  // Tazeyo runs in Turkish; en.json stays the source of truth for the
  // catalogue (and the fallback when a locale file is missing), but an
  // instance with no NEXT_PUBLIC_APP_LOCALE set should come up Turkish.
  const locale = process.env.NEXT_PUBLIC_APP_LOCALE || 'tr';

  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch (error) {
    // Fallback to English if the dictionary for the requested locale doesn't exist yet
    messages = (await import(`../../messages/en.json`)).default;
  }

  return {
    locale,
    messages
  };
});
