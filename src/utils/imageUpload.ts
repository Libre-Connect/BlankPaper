'use client';

import type { Locale } from '@/utils/locale';
import { translate } from '@/utils/locale';

const DIRECT_UPLOAD_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const MAX_DIRECT_UPLOAD_BYTES = 1_800_000;
const TARGET_UPLOAD_BYTES = 2_000_000;
const IMAGE_MAX_EDGE_STEPS = [2048, 1800, 1536, 1280];
const IMAGE_QUALITY_STEPS = [0.9, 0.82, 0.74, 0.66];

const getProcessingErrorMessage = (locale: Locale) =>
  translate(
    locale,
    '图片处理失败，请换一张 JPG、PNG 或 WebP 图片重试',
    'Image processing failed. Try a JPG, PNG, or WebP image.',
  );

function readBlobAsDataUrl(blob: Blob, locale: Locale) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error(translate(locale, '图片读取失败', 'Failed to read the image.')));
    };
    reader.onerror = () => reject(new Error(translate(locale, '图片读取失败', 'Failed to read the image.')));
    reader.readAsDataURL(blob);
  });
}

function loadImageElement(file: File, locale: Locale) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    const cleanup = () => URL.revokeObjectURL(objectUrl);

    image.onload = () => {
      cleanup();
      resolve(image);
    };

    image.onerror = () => {
      cleanup();
      reject(new Error(getProcessingErrorMessage(locale)));
    };

    image.src = objectUrl;
  });
}

function getScaledDimensions(width: number, height: number, maxEdge: number) {
  const currentMaxEdge = Math.max(width, height);

  if (currentMaxEdge <= maxEdge) {
    return { width, height };
  }

  const scale = maxEdge / currentMaxEdge;

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number, locale: Locale) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error(getProcessingErrorMessage(locale)));
      },
      'image/jpeg',
      quality,
    );
  });
}

async function compressImage(file: File, locale: Locale) {
  const image = await loadImageElement(file, locale);
  const lastMaxEdge = IMAGE_MAX_EDGE_STEPS[IMAGE_MAX_EDGE_STEPS.length - 1];
  const lastQuality = IMAGE_QUALITY_STEPS[IMAGE_QUALITY_STEPS.length - 1];

  for (const maxEdge of IMAGE_MAX_EDGE_STEPS) {
    const { width, height } = getScaledDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height, maxEdge);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error(getProcessingErrorMessage(locale));
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    for (const quality of IMAGE_QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, quality, locale);

      if (blob.size <= TARGET_UPLOAD_BYTES || (maxEdge === lastMaxEdge && quality === lastQuality)) {
        return readBlobAsDataUrl(blob, locale);
      }
    }
  }

  throw new Error(getProcessingErrorMessage(locale));
}

export async function prepareImageDataUrl(file: File, locale: Locale) {
  if (DIRECT_UPLOAD_TYPES.has(file.type) && file.size <= MAX_DIRECT_UPLOAD_BYTES) {
    return readBlobAsDataUrl(file, locale);
  }

  try {
    return await compressImage(file, locale);
  } catch (error) {
    if (DIRECT_UPLOAD_TYPES.has(file.type)) {
      return readBlobAsDataUrl(file, locale);
    }

    throw error instanceof Error ? error : new Error(getProcessingErrorMessage(locale));
  }
}
