'use client';

import { useEffect, useMemo, useState } from 'react';
import { ImagePlus, LoaderCircle, Sparkles, X } from 'lucide-react';
import { Locale, translate } from '@/utils/locale';

interface AIGenerateModalProps {
  open: boolean;
  locale: Locale;
  initialTitle: string;
  initialPrompt: string;
  isGenerating: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (payload: { title: string; prompt: string; images: File[] }) => void;
}

type AIGenerateModalContentProps = AIGenerateModalProps;

function AIGenerateModalContent({
  open,
  locale,
  initialTitle,
  initialPrompt,
  isGenerating,
  errorMessage,
  onClose,
  onSubmit,
}: AIGenerateModalContentProps) {
  const tr = (zh: string, en: string) => translate(locale, zh, en);
  const [title, setTitle] = useState(initialTitle);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [images, setImages] = useState<File[]>([]);
  const [imageInputKey, setImageInputKey] = useState(0);
  const remainingSlots = Math.max(0, 4 - images.length);

  useEffect(() => {
    if (!open) return;
    setTitle(initialTitle);
    setPrompt(initialPrompt);
    setImages([]);
    setImageInputKey((value) => value + 1);
  }, [initialPrompt, initialTitle, open]);

  const previewUrls = useMemo(
    () =>
      images.map((image) => ({
        name: image.name,
        url: URL.createObjectURL(image),
      })),
    [images],
  );

  useEffect(() => {
    return () => {
      previewUrls.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previewUrls]);

  const updateImages = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImages((previous) => [...previous, ...Array.from(files).slice(0, Math.max(0, 4 - previous.length))].slice(0, 4));
    setImageInputKey((value) => value + 1);
  };

  const removeImageAt = (index: number) => {
    setImages((previous) => previous.filter((_, itemIndex) => itemIndex !== index));
    setImageInputKey((value) => value + 1);
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-[28px] border border-white/60 bg-[#f7f1e6] p-6 shadow-[0_40px_120px_rgba(0,0,0,0.28)] md:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-black/35">{tr('AI 生成白纸', 'AI Blankpaper')}</div>
            <h3 className="mt-3 text-2xl font-semibold text-neutral-900 md:text-3xl">
              {tr(
                '输入文字和多张图片，生成落在白纸上的事件记录',
                'Turn text and multiple images into an event sheet pinned onto blank paper',
              )}
            </h3>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              {tr(
                'AI 会把零散素材整理成适合展示在白纸上的标题、脉络、正文和结论。上传的多张图片会一起参与视觉判断，并直接贴进白纸结果里。',
                'AI will turn scattered material into a title, structure, body, and closing that fit the paper. Uploaded images are analyzed together and pinned directly into the final sheet.',
              )}
            </p>
          </div>

          <button
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white/80 text-black/70 transition hover:bg-white"
            title={tr('关闭', 'Close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-neutral-700">{tr('事件标题', 'Event Title')}</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={tr('例如：深夜地铁站的一场临时疏散', 'Example: an emergency evacuation at a subway station late at night')}
                className="rounded-2xl border border-black/10 bg-white/85 px-4 py-3 text-base text-neutral-900 outline-none transition focus:border-black/30"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-neutral-700">{tr('输入文字素材', 'Text Material')}</span>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={tr(
                  '写下事件经过、你看到的细节、想表达的结果，或者贴一段原始说明。',
                  'Write down what happened, the details you noticed, the outcome you want to express, or paste the original raw description.',
                )}
                className="min-h-56 rounded-[24px] border border-black/10 bg-white/85 px-4 py-4 text-base leading-7 text-neutral-900 outline-none transition focus:border-black/30"
              />
            </label>
          </div>

          <div className="flex flex-col gap-4">
            <div
              className={`relative flex flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed px-4 py-5 text-center transition ${
                isGenerating || remainingSlots === 0
                  ? 'cursor-not-allowed border-black/8 bg-white/55 opacity-70'
                  : 'cursor-pointer border-black/15 bg-white/75 hover:bg-white/90'
              }`}
            >
              <input
                key={imageInputKey}
                type="file"
                accept="image/*"
                multiple
                aria-label={tr('上传图片线索', 'Upload Visual Clues')}
                disabled={isGenerating || remainingSlots === 0}
                className="absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                onChange={(event) => {
                  updateImages(event.target.files);
                  event.target.value = '';
                }}
              />
              <div className="pointer-events-none">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-black text-white">
                  <ImagePlus size={22} />
                </span>
                <div className="mt-3">
                  <div className="text-[13px] font-semibold leading-5 whitespace-nowrap text-neutral-800 md:text-sm">
                    {remainingSlots === 0
                      ? tr('已选满 4 张图片', '4 images selected')
                      : images.length > 0
                        ? tr(`继续添加图片 (${images.length}/4)`, `Add More Images (${images.length}/4)`)
                        : tr('上传图片线索', 'Upload Visual Clues')}
                  </div>
                  <div className="mt-1 text-xs leading-5 text-neutral-500">
                    {tr(
                      '最多 4 张，支持现场图、截图、海报、物件照片，AI 会一起看图再生成',
                      'Up to 4 images. Scene photos, screenshots, posters, and object shots are all supported and will be analyzed together.',
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-black/8 bg-white/55 px-4 py-3 text-[11px] leading-5 text-neutral-500 md:text-xs">
              {images.length > 0
                ? tr(
                    `已选择 ${images.length} 张图片，生成时会连同文字一起发送给 AI。`,
                    `${images.length} image(s) selected and will be sent to AI together with your text.`,
                  )
                : tr(
                    '选择图片后，这里会立刻显示缩略图和文件名。',
                    'Selected images will appear here immediately with thumbnails and filenames.',
                  )}
            </div>

            <div className="overflow-hidden rounded-[24px] border border-black/10 bg-white/70">
              {previewUrls.length > 0 ? (
                <div className="grid max-h-64 grid-cols-2 gap-3 overflow-y-auto p-4">
                  {previewUrls.map((preview, index) => (
                    <div key={`${preview.name}-${index}`} className="overflow-hidden rounded-2xl border border-black/8 bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview.url} alt="" className="h-28 w-full object-cover" />
                      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-neutral-600">
                        <span className="min-w-0 flex-1 truncate">{preview.name}</span>
                        <button
                          type="button"
                          onClick={() => removeImageAt(index)}
                          className="shrink-0 whitespace-nowrap text-[11px] font-medium text-neutral-900"
                        >
                          {tr('移除', 'Remove')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-48 items-center justify-center px-6 text-sm leading-6 text-neutral-400">
                  {tr(
                    '没有上传图片时，AI 会只根据文字生成白纸内容。',
                    'If no image is uploaded, AI will generate the sheet from text only.',
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 border-t border-black/10 pt-5 md:flex-row md:items-center md:justify-between">
          <p className="text-xs leading-5 text-neutral-500">
            {tr(
              '建议把标题、经过、结果和想强调的细节一起给 AI，这样生成的白纸更完整。',
              'It works best when you give AI the title, sequence, outcome, and the details you want to emphasize.',
            )}
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-black/10 bg-white/80 px-5 py-3 text-xs font-medium whitespace-nowrap text-neutral-700 transition hover:bg-white md:text-sm"
            >
              {tr('取消', 'Cancel')}
            </button>
            <button
              type="button"
              onClick={() => onSubmit({ title, prompt, images })}
              disabled={isGenerating || (!title.trim() && !prompt.trim() && images.length === 0)}
              className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-3 text-xs font-semibold whitespace-nowrap text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:bg-black/30 md:text-sm"
            >
              {isGenerating ? <LoaderCircle className="animate-spin" size={18} /> : <Sparkles size={18} />}
              {tr('生成白纸内容', 'Generate Blankpaper')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AIGenerateModal({ open, ...props }: AIGenerateModalProps) {
  if (!open) return null;

  return <AIGenerateModalContent open={open} {...props} />;
}
