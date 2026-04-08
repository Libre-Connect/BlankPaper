export type Locale = 'zh' | 'en';

export const LOCALE_STORAGE_KEY = 'blankpaper-locale';
export const LEGACY_LOCALE_STORAGE_KEY = 'whitepaper-locale';
export const DISPLAY_TIME_ZONE = 'Australia/Melbourne';

export const translate = (locale: Locale, zh: string, en: string) =>
  locale === 'en' ? en : zh;

const EFFECT_LABELS: Record<string, { zh: string; en: string }> = {
  none: { zh: '无特效', en: 'None' },
  hands: { zh: '手捧', en: 'Hands' },
  blood: { zh: '血迹', en: 'Blood' },
  wood: { zh: '木桌', en: 'Wood Desk' },
  marble: { zh: '大理石', en: 'Marble' },
  grass: { zh: '草地', en: 'Grass' },
  desk: { zh: '办公桌', en: 'Desk' },
  concrete: { zh: '水泥地', en: 'Concrete' },
  sand: { zh: '沙滩', en: 'Sand' },
  water_drops: { zh: '水滴', en: 'Water Drops' },
  fire: { zh: '火焰', en: 'Fire' },
  ice: { zh: '冰块', en: 'Ice' },
  neon: { zh: '霓虹灯', en: 'Neon' },
  space: { zh: '星空', en: 'Space' },
  vintage: { zh: '复古', en: 'Vintage' },
  futuristic: { zh: '未来科技', en: 'Futuristic' },
  coffee_stain: { zh: '咖啡渍', en: 'Coffee Stain' },
  crumpled: { zh: '褶皱', en: 'Crumpled' },
  grid: { zh: '网格', en: 'Grid' },
  blueprint: { zh: '蓝图', en: 'Blueprint' },
  blackboard: { zh: '黑板', en: 'Blackboard' },
};

const ERROR_MESSAGES: Record<string, { zh: string; en: string }> = {
  '图片读取失败': { zh: '图片读取失败', en: 'Failed to read the image.' },
  '素材读取失败': { zh: '素材读取失败', en: 'Failed to read the asset.' },
  '录音启动失败': { zh: '录音启动失败', en: 'Failed to start recording.' },
  'AI 生成失败': { zh: 'AI 生成失败', en: 'AI generation failed.' },
  'AI 服务暂时不可用': { zh: 'AI 服务暂时不可用', en: 'The AI service is temporarily unavailable.' },
  'AI 返回了空内容': { zh: 'AI 返回了空内容', en: 'The AI service returned empty content.' },
  'AI 返回内容格式异常': { zh: 'AI 返回内容格式异常', en: 'The AI service returned an invalid content format.' },
  'AI 密钥未配置': { zh: 'AI 密钥未配置', en: 'The AI API key is not configured.' },
};

export const getEffectLabel = (effectId: string, locale: Locale, fallback: string) =>
  EFFECT_LABELS[effectId]?.[locale] || fallback;

export const translateErrorMessage = (message: string, locale: Locale) =>
  ERROR_MESSAGES[message]?.[locale] || message;
