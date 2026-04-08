import { DISPLAY_TIME_ZONE, Locale } from '@/utils/locale';

const getDisplayLocale = (locale: Locale) => (locale === 'en' ? 'en-AU' : 'zh-CN');

const getDateValue = (value: Date | string | number) => (value instanceof Date ? value : new Date(value));

const getPartValue = (
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
) => parts.find((part) => part.type === type)?.value || '';

export const formatDisplayDate = (value: Date | string | number, locale: Locale = 'zh') => {
  const dateFormatter = new Intl.DateTimeFormat(getDisplayLocale(locale), {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: DISPLAY_TIME_ZONE,
  });
  const parts = dateFormatter.formatToParts(getDateValue(value));
  const year = getPartValue(parts, 'year');
  const month = getPartValue(parts, 'month');
  const day = getPartValue(parts, 'day');

  return locale === 'en' ? `${day}/${month}/${year}` : `${year}/${month}/${day}`;
};

export const formatDisplayTime = (value: Date | string | number, locale: Locale = 'zh') =>
  new Intl.DateTimeFormat(getDisplayLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: DISPLAY_TIME_ZONE,
  }).format(getDateValue(value));
