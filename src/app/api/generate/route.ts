import { NextRequest, NextResponse } from 'next/server';
import type { GenerateWhitepaperRequestPayload } from '@/types';
import type { Locale } from '@/utils/locale';
import {
  buildGenerateMessages,
  buildRepairMessages,
  normalizeStructuredData,
  parseStructuredPayload,
  type WhitepaperChatMessage,
} from '@/utils/whitepaperAI';

export const runtime = 'nodejs';

const OPENAI_API_URL = process.env.OPENAI_API_URL || 'https://api.openai.com/v1/responses';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const OPENAI_REASONING_EFFORT = process.env.OPENAI_REASONING_EFFORT?.trim();
const SUPPORTED_IMAGE_DATA_URL_PREFIXES = ['data:image/jpeg', 'data:image/jpg', 'data:image/png', 'data:image/webp', 'data:image/gif'];

type OpenAIErrorPayload = {
  message?: string;
  type?: string;
  code?: string;
};

type OpenAIResponsePayload = {
  output_text?: unknown;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: unknown;
    }>;
  }>;
  error?: OpenAIErrorPayload;
};

class RouteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const tr = (locale: Locale, zh: string, en: string) => (locale === 'en' ? en : zh);

function resolveLocale(value: unknown): Locale {
  return value === 'en' ? 'en' : 'zh';
}

function safeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeImageDataUrls(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => {
      const normalized = item.toLowerCase();
      return SUPPORTED_IMAGE_DATA_URL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
    })
    .slice(0, 4);
}

function toResponsesPayload(messages: WhitepaperChatMessage[]) {
  const systemMessage = messages.find((message) => message.role === 'system');
  const userMessage = messages.find((message) => message.role === 'user');

  const instructions = typeof systemMessage?.content === 'string' ? systemMessage.content : '';
  const content = Array.isArray(userMessage?.content)
    ? userMessage.content
        .map((item) => {
          if (!item || typeof item !== 'object') return null;

          const entry = item as {
            type?: string;
            text?: unknown;
            image_url?: {
              url?: unknown;
            };
          };

          if (entry.type === 'text' && typeof entry.text === 'string') {
            return {
              type: 'input_text',
              text: entry.text,
            };
          }

          if (entry.type === 'image_url' && typeof entry.image_url?.url === 'string') {
            return {
              type: 'input_image',
              image_url: entry.image_url.url,
              detail: 'auto',
            };
          }

          return null;
        })
        .filter(
          (
            item,
          ): item is { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string; detail: 'auto' } =>
            item !== null,
        )
    : [
        {
          type: 'input_text' as const,
          text: typeof userMessage?.content === 'string' ? userMessage.content : '',
        },
      ];

  return {
    instructions,
    input: [
      {
        role: 'user',
        content,
      },
    ],
  };
}

function extractOpenAIText(data: OpenAIResponsePayload) {
  const directText = safeText(data.output_text);

  if (directText) {
    return directText;
  }

  if (!Array.isArray(data.output)) {
    return '';
  }

  return data.output
    .flatMap((item) =>
      Array.isArray(item.content)
        ? item.content
            .map((contentItem) => {
              if (!contentItem || typeof contentItem !== 'object') return '';

              const textValue = contentItem.text;

              if (typeof textValue === 'string') {
                return textValue;
              }

              if (textValue && typeof textValue === 'object' && 'value' in textValue && typeof textValue.value === 'string') {
                return textValue.value;
              }

              return '';
            })
            .filter(Boolean)
        : [],
    )
    .join('\n')
    .trim();
}

function normalizeOpenAIError(status: number, data: OpenAIResponsePayload | null, locale: Locale) {
  const source = `${safeText(data?.error?.message)} ${safeText(data?.error?.type)} ${safeText(data?.error?.code)}`.toLowerCase();

  if (status === 401 || /invalid api key|incorrect api key|unauthorized|authentication/.test(source)) {
    return new RouteError(500, tr(locale, 'AI 密钥未配置', 'The AI API key is not configured.'));
  }

  if (status === 429 || /rate limit|quota|insufficient_quota/.test(source)) {
    return new RouteError(503, tr(locale, 'AI 服务暂时不可用', 'The AI service is temporarily unavailable.'));
  }

  if (/policy|safety|content/.test(source)) {
    return new RouteError(400, tr(locale, 'AI 生成失败', 'AI generation failed.'));
  }

  if (status >= 500 || /model|does not exist|unsupported|not found/.test(source)) {
    return new RouteError(503, tr(locale, 'AI 服务暂时不可用', 'The AI service is temporarily unavailable.'));
  }

  return new RouteError(status || 500, tr(locale, 'AI 生成失败', 'AI generation failed.'));
}

async function requestOpenAIText(messages: WhitepaperChatMessage[], locale: Locale) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new RouteError(500, tr(locale, 'AI 密钥未配置', 'The AI API key is not configured.'));
  }

  const payload = toResponsesPayload(messages);
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    cache: 'no-store',
    body: JSON.stringify({
      model: OPENAI_MODEL,
      store: false,
      instructions: payload.instructions,
      input: payload.input,
      ...(OPENAI_REASONING_EFFORT ? { reasoning: { effort: OPENAI_REASONING_EFFORT } } : {}),
    }),
  });

  const data = (await response.json().catch(() => null)) as OpenAIResponsePayload | null;

  if (!response.ok) {
    throw normalizeOpenAIError(response.status, data, locale);
  }

  const text = data ? extractOpenAIText(data) : '';

  if (!text) {
    throw new RouteError(502, tr(locale, 'AI 返回了空内容', 'The AI service returned empty content.'));
  }

  return {
    model: OPENAI_MODEL,
    text,
  };
}

export async function POST(request: NextRequest) {
  let payload: GenerateWhitepaperRequestPayload | null = null;

  try {
    payload = (await request.json()) as GenerateWhitepaperRequestPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const locale = resolveLocale(payload?.locale);
  const title = safeText(payload?.title);
  const prompt = safeText(payload?.prompt);
  const imageDataUrls = sanitizeImageDataUrls(payload?.imageDataUrls);

  if (!title && !prompt && imageDataUrls.length === 0) {
    return NextResponse.json(
      {
        error: tr(
          locale,
          '请至少输入标题、文字或图片中的一项',
          'Please provide at least a title, some text, or an image.',
        ),
      },
      { status: 400 },
    );
  }

  try {
    const generated = await requestOpenAIText(buildGenerateMessages(title, prompt, imageDataUrls, locale), locale);

    try {
      const parsed = parseStructuredPayload(generated.text);
      const data = normalizeStructuredData(parsed, title, prompt, generated.model, locale, imageDataUrls.length);
      return NextResponse.json({
        title: data.headline || title,
        data,
      });
    } catch {
      const repaired = await requestOpenAIText(buildRepairMessages(generated.text, locale), locale);

      try {
        const repairedParsed = parseStructuredPayload(repaired.text);
        const data = normalizeStructuredData(repairedParsed, title, prompt, repaired.model, locale, imageDataUrls.length);
        return NextResponse.json({
          title: data.headline || title,
          data,
        });
      } catch {
        return NextResponse.json(
          { error: tr(locale, 'AI 返回内容格式异常', 'The AI service returned an invalid content format.') },
          { status: 502 },
        );
      }
    }
  } catch (error) {
    if (error instanceof RouteError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: tr(locale, 'AI 生成失败', 'AI generation failed.') },
      { status: 500 },
    );
  }
}
