'use client';

import { CSSProperties, ChangeEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { AIResults } from '@/components/AIResults';
import { AIGenerateModal } from '@/components/AIGenerateModal';
import { AIGeneratedData, PaperLayoutMode, PaperModuleKey, PaperModuleTransform, WhitepaperEvent, WhitepaperMediaItem, WhitepaperNote } from '@/types';
import { PenTool, Sparkles, Globe, KeyRound, Send, History, PlusCircle, Palette, Share2, ImagePlus, Mic, Square, Eye, X, ChevronsLeft, ChevronsRight } from 'lucide-react';
import {
  fetchPapersByCode,
  fetchPublicPapers,
  fetchUserPapers,
  getClientAuthorId,
  savePaperToLocal,
  savePaperToServer,
} from '@/utils/paperStorage';
import { BACKGROUND_EFFECTS } from '@/utils/constants';
import { prepareImageDataUrl } from '@/utils/imageUpload';
import { formatDisplayDate, formatDisplayTime } from '@/utils/dateFormat';
import { getEffectLabel, LEGACY_LOCALE_STORAGE_KEY, Locale, LOCALE_STORAGE_KEY, translate, translateErrorMessage } from '@/utils/locale';
import { isPaperLayoutMode } from '@/utils/paperLayout';

const DEFAULT_TIMELINE_LENGTH = 3;
const DEFAULT_OBSERVATION_LENGTH = 3;
const DEFAULT_BODY_LENGTH = 3;
const DEFAULT_NOTE_TONES: WhitepaperNote['tone'][] = ['amber', 'blue', 'charcoal'];
const DEFAULT_LOCALE: Locale = 'zh';

type FloatingActionButtonProps = {
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  tone?: 'default' | 'active' | 'dark' | 'danger';
  labelClassName?: string;
  children: ReactNode;
};

function FloatingActionButton({
  label,
  title,
  active = false,
  disabled = false,
  onClick,
  tone = 'default',
  labelClassName = '',
  children,
}: FloatingActionButtonProps) {
  const resolvedTone = tone === 'default' && active ? 'active' : tone;
  const iconToneClass =
    resolvedTone === 'dark'
      ? 'bg-black text-white border-black shadow-[0_12px_28px_rgba(0,0,0,0.24)]'
      : resolvedTone === 'danger'
        ? 'bg-red-600 text-white border-red-600 shadow-[0_12px_28px_rgba(220,38,38,0.28)]'
        : resolvedTone === 'active'
          ? 'bg-black text-white border-black'
          : 'bg-white/96 text-gray-900 border-white/14 group-hover:scale-110';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="group flex w-[4.6rem] flex-col items-center gap-1.5 text-center disabled:cursor-not-allowed"
    >
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all ${iconToneClass} ${
          disabled ? 'opacity-45 group-hover:scale-100' : ''
        }`}
      >
        {children}
      </span>
      <span
        className={`text-[11px] leading-4 ${resolvedTone === 'default' ? 'text-white/76' : 'font-semibold text-white'} ${disabled ? 'opacity-45' : ''} ${labelClassName}`}
      >
        {label}
      </span>
    </button>
  );
}

const getDefaultFactCardLabels = (locale: Locale) =>
  locale === 'en' ? ['Time', 'Place', 'People', 'Outcome'] : ['时间', '地点', '人物', '结果'];

const createPaperNote = (index = 0): WhitepaperNote => ({
  id: crypto.randomUUID(),
  text: '',
  offsetX: 24 + (index % 3) * 172,
  offsetY: 20 + Math.floor(index / 3) * 34,
  rotation: [-5, 3, -2][index % 3],
  tone: DEFAULT_NOTE_TONES[index % DEFAULT_NOTE_TONES.length],
  layer: 'front',
});

const createMediaItem = (
  locale: Locale,
  kind: WhitepaperMediaItem['kind'],
  src: string,
  name?: string,
  index = 0,
): WhitepaperMediaItem => ({
  id: crypto.randomUUID(),
  kind,
  src,
  name,
  alt: name || (kind === 'image' ? translate(locale, '白纸素材图片', 'Blankpaper image asset') : undefined),
  caption:
    kind === 'image'
      ? translate(locale, '我把这张图贴在页边，怕自己以后记不清。', 'I pinned this photo to the edge so I would not forget it later.')
      : translate(locale, '我把这一小段声音也留在了纸上。', 'I left this small piece of sound on the page as well.'),
  offsetX: 18 + (index % 3) * 168,
  offsetY: 22 + Math.floor(index / 3) * 44,
  rotation: [-5, 4, -2][index % 3],
  scale: 1,
  layer: 'front',
  mimeType: kind === 'audio' ? 'audio/webm' : undefined,
});

const normalizePaperNote = (note: WhitepaperNote): WhitepaperNote => ({
  ...note,
  layer: note.layer || 'front',
});

const normalizeMediaItem = (item: WhitepaperMediaItem, locale: Locale): WhitepaperMediaItem => ({
  ...item,
  caption:
    item.caption ||
    (item.kind === 'image'
      ? translate(locale, '我把这张图贴在页边，怕自己以后记不清。', 'I pinned this photo to the edge so I would not forget it later.')
      : translate(locale, '我把这一小段声音也留在了纸上。', 'I left this small piece of sound on the page as well.')),
  scale: item.scale ?? 1,
  layer: item.layer || 'front',
});

const normalizeReferenceImage = (image: NonNullable<WhitepaperEvent['referenceImage']>): NonNullable<WhitepaperEvent['referenceImage']> => ({
  ...image,
  layer: image.layer || 'front',
});

const normalizeModuleTransforms = (value: WhitepaperEvent['moduleTransforms']): Partial<Record<PaperModuleKey, PaperModuleTransform>> =>
  Object.fromEntries(
    Object.entries(value || {})
      .filter((entry): entry is [PaperModuleKey, PaperModuleTransform] => Boolean(entry[0] && entry[1]))
      .map(([key, transform]) => [
        key,
        {
          offsetX: Number.isFinite(transform.offsetX) ? transform.offsetX : 0,
          offsetY: Number.isFinite(transform.offsetY) ? transform.offsetY : 0,
          rotation: Number.isFinite(transform.rotation) ? transform.rotation : 0,
          layer: transform.layer || 'front',
        },
      ]),
  ) as Partial<Record<PaperModuleKey, PaperModuleTransform>>;

const normalizeLayoutMode = (layoutMode: WhitepaperEvent['layoutMode'], hasAIRecommendation = false) =>
  (isPaperLayoutMode(layoutMode) ? layoutMode : hasAIRecommendation ? 'ai' : 'minimal');

const normalizeFontScale = (fontScale: WhitepaperEvent['fontScale']) => {
  if (typeof fontScale !== 'number' || Number.isNaN(fontScale)) return 1;
  return Math.min(1.3, Math.max(0.84, Number(fontScale.toFixed(2))));
};

const createBlankGeneratedData = (locale: Locale, seed?: Partial<AIGeneratedData>): AIGeneratedData => ({
  headline: seed?.headline || '',
  subtitle: seed?.subtitle || '',
  lead: seed?.lead || '',
  handwrittenBody:
    seed?.handwrittenBody && seed.handwrittenBody.length > 0
      ? seed.handwrittenBody
      : Array.from({ length: DEFAULT_BODY_LENGTH }, () => ''),
  factCards:
    seed?.factCards && seed.factCards.length > 0
      ? seed.factCards
      : getDefaultFactCardLabels(locale).map((label) => ({
          id: crypto.randomUUID(),
          label,
          value: '',
        })),
  timeline:
    seed?.timeline && seed.timeline.length > 0
      ? seed.timeline
      : Array.from({ length: DEFAULT_TIMELINE_LENGTH }, () => ({
          id: crypto.randomUUID(),
          dateString: '',
          description: '',
        })),
  observations:
    seed?.observations && seed.observations.length > 0
      ? seed.observations
      : Array.from({ length: DEFAULT_OBSERVATION_LENGTH }, () => ''),
  closing: seed?.closing || '',
  imageInsight: seed?.imageInsight || '',
  layoutRecommendation: seed?.layoutRecommendation || 'minimal',
  model: seed?.model || 'manual',
});

const withPaperAuthor = (paper: WhitepaperEvent, authorID: string): WhitepaperEvent => ({
  ...paper,
  collaboration: {
    authorID,
    isForked: Boolean(paper.collaboration?.isForked),
    originalEventID: paper.collaboration?.originalEventID,
    contributors: Array.from(new Set([...(paper.collaboration?.contributors || []), authorID])),
  },
});

const createInitialEvent = (locale: Locale, authorID = 'anon-local'): WhitepaperEvent => ({
  id: crypto.randomUUID(),
  title: '',
  originalContent: '',
  aiGeneratedData: createBlankGeneratedData(locale),
  mediaItems: [],
  paperNotes: [],
  collaboration: {
    authorID,
    isForked: false,
    contributors: [authorID],
  },
  backgroundEffect: 'none',
  fontScale: 1,
  layoutMode: 'minimal',
  moduleTransforms: {},
  createdAt: new Date(),
  updatedAt: new Date(),
});

const getPaperPreview = (paper: WhitepaperEvent, locale: Locale) => {
  return (
    paper.aiGeneratedData?.lead ||
    paper.aiGeneratedData?.handwrittenBody?.[0] ||
    paper.originalContent ||
    translate(locale, '这张白纸还没有写下更多内容。', 'There is nothing else written on this sheet yet.')
  );
};

const SQUARE_BATCH_SIZE = 9;

const splitParagraphs = (content: string) =>
  content
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

const ensureStructuredPaper = (paper: WhitepaperEvent, locale: Locale): WhitepaperEvent => {
  if (paper.aiGeneratedData) {
    return {
      ...paper,
      aiGeneratedData: createBlankGeneratedData(locale, paper.aiGeneratedData),
      referenceImage: paper.referenceImage ? normalizeReferenceImage(paper.referenceImage) : undefined,
      mediaItems: (paper.mediaItems || []).map((item) => normalizeMediaItem(item, locale)),
      paperNotes: (paper.paperNotes || []).map(normalizePaperNote),
      fontScale: normalizeFontScale(paper.fontScale),
      layoutMode: normalizeLayoutMode(paper.layoutMode, paper.aiGeneratedData.model !== 'manual'),
      moduleTransforms: normalizeModuleTransforms(paper.moduleTransforms),
    };
  }

  const legacyParagraphs = splitParagraphs(paper.originalContent);

  return {
    ...paper,
    aiGeneratedData: createBlankGeneratedData(locale, {
      headline: paper.title,
      handwrittenBody: legacyParagraphs.length > 0 ? legacyParagraphs.slice(0, 4) : undefined,
      lead: legacyParagraphs[0] || '',
    }),
    referenceImage: paper.referenceImage ? normalizeReferenceImage(paper.referenceImage) : undefined,
    mediaItems: (paper.mediaItems || []).map((item) => normalizeMediaItem(item, locale)),
    paperNotes: (paper.paperNotes || []).map(normalizePaperNote),
    fontScale: normalizeFontScale(paper.fontScale),
    layoutMode: normalizeLayoutMode(paper.layoutMode),
    moduleTransforms: normalizeModuleTransforms(paper.moduleTransforms),
  };
};

const hasStructuredContent = (paper: WhitepaperEvent) => {
  const data = paper.aiGeneratedData;

  if (paper.referenceImage?.src) return true;
  if (!data) return Boolean(paper.title.trim() || paper.originalContent.trim());

  return Boolean(
    paper.mediaItems?.some((item) => item.src.trim()) ||
    paper.paperNotes?.some((note) => note.text.trim()) ||
    data.headline.trim() ||
      data.subtitle.trim() ||
      data.lead.trim() ||
      data.handwrittenBody.some((item) => item.trim()) ||
      data.factCards.some((item) => item.value.trim()) ||
      data.timeline.some((item) => item.dateString.trim() || item.description.trim()) ||
      data.observations.some((item) => item.trim()) ||
      data.closing.trim() ||
      data.imageInsight?.trim(),
  );
};

const hydratePaper = (paper: WhitepaperEvent): WhitepaperEvent => ({
  ...paper,
  createdAt: new Date(paper.createdAt),
  updatedAt: new Date(paper.updatedAt),
  fontScale: normalizeFontScale(paper.fontScale),
  layoutMode: normalizeLayoutMode(paper.layoutMode, Boolean(paper.aiGeneratedData && paper.aiGeneratedData.model !== 'manual')),
  moduleTransforms: normalizeModuleTransforms(paper.moduleTransforms),
});

const pickRandomPapers = (papers: WhitepaperEvent[], count = SQUARE_BATCH_SIZE) => {
  const next = [...papers];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next.slice(0, Math.min(count, next.length));
};

const readBlobAsDataUrl = (blob: Blob, locale: Locale) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error(translate(locale, '素材读取失败', 'Failed to read the asset.')));
    };
    reader.onerror = () => reject(new Error(translate(locale, '素材读取失败', 'Failed to read the asset.')));
    reader.readAsDataURL(blob);
  });

const getEffectPreviewStyle = (effectId: string, bgColor?: string): CSSProperties => {
  const previews: Record<string, string> = {
    none: 'linear-gradient(180deg, #313131 0%, #1d1d1d 100%)',
    hands:
      'linear-gradient(180deg, #edf2f6 0%, #d3dae4 100%), radial-gradient(circle at 20% 12%, #e9c09f 0 12%, transparent 13%), radial-gradient(circle at 80% 12%, #e9c09f 0 12%, transparent 13%), linear-gradient(180deg, rgba(30, 38, 47, 0.86) 0 18%, transparent 19% 100%)',
    blood:
      'linear-gradient(145deg, #26080b 0%, #120709 100%), radial-gradient(circle at 22% 24%, rgba(179, 13, 27, 0.9) 0 12%, transparent 13%), radial-gradient(circle at 68% 70%, rgba(123, 0, 10, 0.85) 0 16%, transparent 17%)',
    wood:
      'linear-gradient(90deg, #4c2e1d 0%, #855333 18%, #5a331f 40%, #93613f 70%, #3d2314 100%)',
    marble:
      'linear-gradient(135deg, #f0f2f5 0%, #d8dde3 100%), linear-gradient(125deg, transparent 0 32%, rgba(129, 137, 149, 0.45) 33% 34%, transparent 35% 100%), linear-gradient(36deg, transparent 0 58%, rgba(255,255,255,0.9) 59% 60%, transparent 61% 100%)',
    grass:
      'linear-gradient(125deg, #1f5e23 0%, #12381a 100%), repeating-linear-gradient(112deg, rgba(88, 180, 74, 0.34) 0 4px, transparent 4px 16px), repeating-linear-gradient(68deg, rgba(31, 93, 32, 0.28) 0 2px, transparent 2px 12px)',
    desk:
      'linear-gradient(180deg, #35373f 0%, #1f2024 100%), radial-gradient(circle at 50% 16%, rgba(255, 231, 184, 0.22) 0%, transparent 18%), linear-gradient(180deg, transparent 0 76%, rgba(0,0,0,0.25) 100%)',
    concrete:
      'linear-gradient(145deg, #9298a0 0%, #737982 100%), linear-gradient(132deg, transparent 0 48%, rgba(92, 98, 106, 0.38) 49% 50%, transparent 51% 100%), radial-gradient(circle at 26% 30%, rgba(255,255,255,0.18) 0 4%, transparent 5%)',
    sand:
      'linear-gradient(180deg, #e0bc81 0%, #c99356 100%), linear-gradient(166deg, transparent 0 36%, rgba(255, 231, 182, 0.42) 37% 44%, transparent 45% 100%), linear-gradient(12deg, transparent 0 62%, rgba(176, 123, 71, 0.32) 64% 72%, transparent 74% 100%)',
    water_drops:
      'linear-gradient(180deg, #0e6aa0 0%, #0a4269 100%), radial-gradient(circle at 26% 24%, rgba(255,255,255,0.6) 0 6%, transparent 7%), radial-gradient(circle at 74% 68%, rgba(255,255,255,0.4) 0 7%, transparent 8%)',
    fire:
      'linear-gradient(180deg, #230406 0%, #541708 100%), radial-gradient(circle at 28% 100%, rgba(255, 165, 79, 0.86) 0 20%, transparent 21%), radial-gradient(circle at 60% 100%, rgba(255, 80, 0, 0.84) 0 24%, transparent 25%)',
    ice:
      'linear-gradient(180deg, #e3f6ff 0%, #c9e9f5 100%), linear-gradient(132deg, transparent 0 42%, rgba(255,255,255,0.95) 43% 45%, transparent 46% 100%), linear-gradient(42deg, transparent 0 58%, rgba(177, 224, 241, 0.92) 59% 61%, transparent 62% 100%)',
    neon:
      'linear-gradient(180deg, #0b0c12 0%, #141725 100%), linear-gradient(124deg, transparent 0 22%, rgba(0,255,240,0.38) 24% 32%, transparent 34% 64%, rgba(255,0,122,0.36) 66% 74%, transparent 76% 100%)',
    space:
      'linear-gradient(180deg, #06113f 0%, #03081a 100%), radial-gradient(circle at 18% 18%, rgba(255,255,255,0.95) 0 2.2%, transparent 2.5%), radial-gradient(circle at 72% 26%, rgba(255,255,255,0.88) 0 1.8%, transparent 2.2%), radial-gradient(circle at 78% 72%, rgba(255,255,255,0.9) 0 2%, transparent 2.3%)',
    vintage: 'linear-gradient(180deg, #ddb170 0%, #b98250 100%), radial-gradient(circle at center, transparent 42%, rgba(0,0,0,0.34) 100%)',
    futuristic:
      'linear-gradient(180deg, #04090b 0%, #0e1b21 100%), repeating-linear-gradient(90deg, rgba(0,255,247,0.16) 0 1px, transparent 1px 12px), linear-gradient(180deg, transparent 0 44%, rgba(0,255,247,0.28) 46% 54%, transparent 56% 100%)',
    coffee_stain:
      'linear-gradient(180deg, #f1dcc0 0%, #e6c9a4 100%), radial-gradient(circle at 72% 28%, transparent 0 16%, rgba(120,78,50,0.65) 17% 20%, transparent 21% 100%)',
    crumpled:
      'linear-gradient(180deg, #d5d8dd 0%, #b8bcc2 100%), repeating-linear-gradient(52deg, rgba(0,0,0,0.12) 0 1px, transparent 1px 16px), repeating-linear-gradient(-58deg, rgba(255,255,255,0.54) 0 1px, transparent 1px 18px)',
    grid:
      'linear-gradient(180deg, #2d3137 0%, #171a1f 100%), repeating-linear-gradient(0deg, rgba(255,255,255,0.1) 0 1px, transparent 1px 14px), repeating-linear-gradient(90deg, rgba(255,255,255,0.1) 0 1px, transparent 1px 14px)',
    blueprint:
      'linear-gradient(180deg, #0a4a72 0%, #032b44 100%), repeating-linear-gradient(0deg, rgba(255,255,255,0.18) 0 1px, transparent 1px 14px), repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 1px, transparent 1px 14px)',
    blackboard:
      'linear-gradient(180deg, #244539 0%, #182923 100%), linear-gradient(18deg, transparent 0 48%, rgba(255,255,255,0.18) 49% 50%, transparent 51% 100%)',
  };

  return {
    background: previews[effectId] || `linear-gradient(180deg, ${bgColor || '#f3f4f6'} 0%, ${bgColor || '#d1d5db'} 100%)`,
    backgroundColor: bgColor || '#f3f4f6',
  };
};

export default function Home() {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const tr = (zh: string, en: string) => translate(locale, zh, en);
  const [event, setEvent] = useState<WhitepaperEvent>(() => createInitialEvent(locale));
  const [authorID, setAuthorID] = useState('anon-local');
  const [draft, setDraft] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [unlockVersion, setUnlockVersion] = useState(0);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'write' | 'square' | 'secret' | 'history'>('write');
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isPublic, setIsPublic] = useState(true);
  const [secretCode, setSecretCode] = useState('');
  const [publicPapers, setPublicPapers] = useState<WhitepaperEvent[]>([]);
  const [searchCode, setSearchCode] = useState('');
  const [secretPapers, setSecretPapers] = useState<WhitepaperEvent[]>([]);
  const [userPapers, setUserPapers] = useState<WhitepaperEvent[]>([]);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [showBgSelector, setShowBgSelector] = useState(false);
  const [isPaperReadOnly, setIsPaperReadOnly] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const unlockTimerRef = useRef<number | null>(null);
  const serverSaveTimerRef = useRef<number | null>(null);
  const toolbarImageInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const storedLocale =
      window.localStorage.getItem(LOCALE_STORAGE_KEY) ||
      window.localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY);

    if (storedLocale === 'en') {
      setLocale('en');
    }
  }, []);

  useEffect(() => {
    const nextAuthorID = getClientAuthorId();
    setAuthorID(nextAuthorID);
    setEvent((previous) => withPaperAuthor(previous, nextAuthorID));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
    document.title = translate(locale, '白纸事件生成器', 'Blankpaper Generator');
  }, [locale]);

  useEffect(() => {
    if (hasStructuredContent(event) || event.title.trim() || draft.trim()) {
      return;
    }

    if (event.aiGeneratedData?.factCards?.[0]?.label === getDefaultFactCardLabels(locale)[0]) {
      return;
    }

    setEvent((previous) => ({
      ...previous,
      aiGeneratedData: createBlankGeneratedData(locale),
    }));
  }, [draft, event, locale]);

  useEffect(() => {
    return () => {
      if (unlockTimerRef.current) {
        window.clearTimeout(unlockTimerRef.current);
      }
      if (serverSaveTimerRef.current) {
        window.clearTimeout(serverSaveTimerRef.current);
      }

      mediaRecorderRef.current?.stop();
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (viewMode !== 'write' && showPreviewModal) {
      setShowPreviewModal(false);
    }
  }, [showPreviewModal, viewMode]);

  useEffect(() => {
    if (viewMode !== 'write' || isPaperReadOnly) {
      return;
    }

    if (!hasStructuredContent(event) && !draft.trim() && !event.title.trim()) {
      return;
    }

    const nextPaper = withPaperAuthor(
      {
        ...event,
        originalContent: draft,
        updatedAt: new Date(),
      },
      authorID,
    );

    savePaperToLocal(nextPaper);

    if (serverSaveTimerRef.current) {
      window.clearTimeout(serverSaveTimerRef.current);
    }

    serverSaveTimerRef.current = window.setTimeout(() => {
      void savePaperToServer(nextPaper).catch(() => undefined);
    }, 600);

    return () => {
      if (serverSaveTimerRef.current) {
        window.clearTimeout(serverSaveTimerRef.current);
      }
    };
  }, [authorID, draft, event, isPaperReadOnly, viewMode]);

  const triggerUnlockAnimation = () => {
    if (unlockTimerRef.current) {
      window.clearTimeout(unlockTimerRef.current);
    }

    setUnlockVersion((value) => value + 1);
    setIsUnlocking(true);
    unlockTimerRef.current = window.setTimeout(() => {
      setIsUnlocking(false);
    }, 1800);
  };

  const refreshSquarePapers = async () => {
    const allPublicPapers = (await fetchPublicPapers()).map((paper) =>
      ensureStructuredPaper(hydratePaper(paper), locale),
    );
    setPublicPapers(pickRandomPapers(allPublicPapers));
  };

  const openPaper = (paper: WhitepaperEvent, readOnly: boolean) => {
    const nextPaper = readOnly
      ? hydratePaper(paper)
      : withPaperAuthor(ensureStructuredPaper(hydratePaper(paper), locale), authorID);

    setEvent(nextPaper);
    setDraft(nextPaper.originalContent);
    setViewMode('write');
    setIsFocused(true);
    setShowAIModal(false);
    setShowBgSelector(false);
    setShowPreviewModal(false);
    setIsPaperReadOnly(readOnly);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const updateGeneratedData = (updater: (data: AIGeneratedData) => AIGeneratedData) => {
    setEvent((previous) => {
      if (!previous.aiGeneratedData) return previous;

      const nextGeneratedData = updater(previous.aiGeneratedData);

      return {
        ...previous,
        title: nextGeneratedData.headline || previous.title,
        aiGeneratedData: nextGeneratedData,
        updatedAt: new Date(),
      };
    });
  };

  const updateLayoutMode = (layoutMode: PaperLayoutMode) => {
    setEvent((previous) => ({
      ...previous,
      layoutMode,
      updatedAt: new Date(),
    }));
  };

  const updateFontScale = (fontScale: number) => {
    setEvent((previous) => ({
      ...previous,
      fontScale: normalizeFontScale(fontScale),
      updatedAt: new Date(),
    }));
  };

  const updateModuleTransform = (moduleKey: PaperModuleKey, updater: (transform: PaperModuleTransform) => PaperModuleTransform) => {
    setEvent((previous) => ({
      ...previous,
      moduleTransforms: {
        ...(previous.moduleTransforms || {}),
        [moduleKey]: updater(
          previous.moduleTransforms?.[moduleKey] || {
            offsetX: 0,
            offsetY: 0,
            rotation: 0,
            layer: 'front',
          },
        ),
      },
      updatedAt: new Date(),
    }));
  };

  const replaceReferenceImage = async (file: File) => {
    const imageDataUrl = await prepareImageDataUrl(file, locale);

    setEvent((previous) => ({
      ...previous,
      referenceImage: {
        src: imageDataUrl,
        alt: previous.aiGeneratedData?.headline || previous.title || tr('白纸参考图片', 'Blankpaper reference image'),
        name: file.name,
        rotation: previous.referenceImage?.rotation ?? -4,
        offsetX: previous.referenceImage?.offsetX ?? 0,
        offsetY: previous.referenceImage?.offsetY ?? 0,
        scale: previous.referenceImage?.scale ?? 1,
        layer: previous.referenceImage?.layer ?? 'front',
      },
      updatedAt: new Date(),
    }));
  };

  const removeReferenceImage = () => {
    setEvent((previous) => ({
      ...previous,
      referenceImage: undefined,
      updatedAt: new Date(),
    }));
  };

  const transformReferenceImage = (updater: (image: NonNullable<WhitepaperEvent['referenceImage']>) => NonNullable<WhitepaperEvent['referenceImage']>) => {
    setEvent((previous) => {
      if (!previous.referenceImage) return previous;

      return {
        ...previous,
        referenceImage: updater(previous.referenceImage),
        updatedAt: new Date(),
      };
    });
  };

  const addImageFilesToPaper = async (files: File[]) => {
    if (files.length === 0) return;

    const imageDataUrls = await Promise.all(files.map((file) => prepareImageDataUrl(file, locale)));

    setEvent((previous) => {
      let nextReferenceImage = previous.referenceImage;
      const nextMediaItems = [...(previous.mediaItems || [])];

      imageDataUrls.forEach((dataUrl, index) => {
        const file = files[index];

        if (!nextReferenceImage) {
          nextReferenceImage = {
            src: dataUrl,
            alt: previous.aiGeneratedData?.headline || previous.title || file.name || tr('白纸参考图片', 'Blankpaper reference image'),
            name: file.name,
            rotation: -4,
            offsetX: 0,
            offsetY: 0,
            scale: 1,
            layer: 'front',
          };
          return;
        }

        nextMediaItems.push(createMediaItem(locale, 'image', dataUrl, file.name, nextMediaItems.length));
      });

      return {
        ...previous,
        referenceImage: nextReferenceImage,
        mediaItems: nextMediaItems,
        updatedAt: new Date(),
      };
    });
  };

  const updateMediaItem = (mediaItemID: string, updater: (item: WhitepaperMediaItem) => WhitepaperMediaItem) => {
    setEvent((previous) => ({
      ...previous,
      mediaItems: (previous.mediaItems || []).map((item) => (item.id === mediaItemID ? updater(item) : item)),
      updatedAt: new Date(),
    }));
  };

  const removeMediaItem = (mediaItemID: string) => {
    setEvent((previous) => ({
      ...previous,
      mediaItems: (previous.mediaItems || []).filter((item) => item.id !== mediaItemID),
      updatedAt: new Date(),
    }));
  };

  const replaceMediaItemFile = async (mediaItemID: string, file: File) => {
    const imageDataUrl = await prepareImageDataUrl(file, locale);

    updateMediaItem(mediaItemID, (currentItem) => ({
      ...currentItem,
      src: imageDataUrl,
      name: file.name,
      alt: file.name,
      mimeType: file.type,
    }));
  };

  const addRecordedAudioToPaper = async (blob: Blob) => {
    const audioDataUrl = await readBlobAsDataUrl(blob, locale);

    setEvent((previous) => ({
      ...previous,
      mediaItems: [
        ...(previous.mediaItems || []),
        {
          ...createMediaItem(
            locale,
            'audio',
            audioDataUrl,
            `${tr('录音', 'Recording')} ${formatDisplayTime(new Date(), locale)}`,
            previous.mediaItems?.length || 0,
          ),
          mimeType: blob.type || 'audio/webm',
        },
      ],
      updatedAt: new Date(),
    }));
  };

  const handleToolbarImageSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    await addImageFilesToPaper(files);
  };

  const toggleAudioRecording = async () => {
    if (isRecordingAudio) {
      mediaRecorderRef.current?.stop();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setAiErrorMessage(tr('当前浏览器不支持录音。', 'This browser does not support audio recording.'));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm',
      });

      mediaChunksRef.current = [];
      recordingStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      setIsRecordingAudio(true);

      recorder.ondataavailable = (chunkEvent) => {
        if (chunkEvent.data.size > 0) {
          mediaChunksRef.current.push(chunkEvent.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(mediaChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });

        mediaRecorderRef.current = null;
        mediaChunksRef.current = [];
        recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
        setIsRecordingAudio(false);

        if (audioBlob.size > 0) {
          await addRecordedAudioToPaper(audioBlob);
        }
      };

      recorder.start();
    } catch (error) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      mediaRecorderRef.current = null;
      mediaChunksRef.current = [];
      setIsRecordingAudio(false);
      setAiErrorMessage(error instanceof Error ? translateErrorMessage(error.message, locale) : tr('录音启动失败', 'Failed to start recording.'));
    }
  };

  const addPaperNote = () => {
    setEvent((previous) => ({
      ...previous,
      paperNotes: [...(previous.paperNotes || []), createPaperNote(previous.paperNotes?.length || 0)],
      updatedAt: new Date(),
    }));
  };

  const updatePaperNote = (noteID: string, updater: (note: WhitepaperNote) => WhitepaperNote) => {
    setEvent((previous) => ({
      ...previous,
      paperNotes: (previous.paperNotes || []).map((note) => (note.id === noteID ? updater(note) : note)),
      updatedAt: new Date(),
    }));
  };

  const removePaperNote = (noteID: string) => {
    setEvent((previous) => ({
      ...previous,
      paperNotes: (previous.paperNotes || []).filter((note) => note.id !== noteID),
      updatedAt: new Date(),
    }));
  };

  const openAIModal = () => {
    setAiErrorMessage(null);
    setShowBgSelector(false);
    setShowAIModal(true);
    setIsFocused(true);
  };

  const handleGenerate = async (payload: { title: string; prompt: string; images: File[] }) => {
    setIsGenerating(true);
    setAiErrorMessage(null);
    setIsFocused(true);
    setShowBgSelector(false);

    try {
      const imageDataUrls = await Promise.all(payload.images.map((image) => prepareImageDataUrl(image, locale)));
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: payload.title,
          prompt: payload.prompt,
          imageDataUrls,
          locale,
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || tr('AI 生成失败', 'AI generation failed.'));
      }

      const generated = result.data as AIGeneratedData;

      setEvent((previous) =>
        withPaperAuthor(
          {
            ...previous,
            title: generated.headline || payload.title || previous.title || tr('未命名事件', 'Untitled Event'),
            originalContent: payload.prompt,
            aiGeneratedData: generated,
            layoutMode: 'ai',
            referenceImage: previous.referenceImage,
            mediaItems: [
              ...(previous.mediaItems || []),
              ...payload.images.map((file, index) =>
                createMediaItem(
                  locale,
                  'image',
                  imageDataUrls[index],
                  file.name,
                  (previous.mediaItems?.length || 0) + index,
                ),
              ),
            ],
            updatedAt: new Date(),
          },
          authorID,
        ),
      );
      setDraft(payload.prompt);
      setShowAIModal(false);
      setIsPaperReadOnly(false);
      triggerUnlockAnimation();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      const message = error instanceof Error ? translateErrorMessage(error.message, locale) : tr('AI 生成失败', 'AI generation failed.');
      setAiErrorMessage(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = async () => {
    const finalEvent = withPaperAuthor(
      {
        ...event,
        originalContent: draft,
        isPublic,
        secretCode: isPublic ? undefined : secretCode.trim() || undefined,
        updatedAt: new Date(),
      },
      authorID,
    );

    try {
      savePaperToLocal(finalEvent);
      const savedPaper = await savePaperToServer(finalEvent);
      setEvent(savedPaper);
      setPublishSuccess(true);

      window.setTimeout(() => {
        setShowPublishModal(false);
        setPublishSuccess(false);

        if (isPublic) {
          void handleViewSquare();
        }
      }, 1500);
    } catch (error) {
      setAiErrorMessage(
        error instanceof Error ? translateErrorMessage(error.message, locale) : tr('发布失败', 'Failed to publish the paper.'),
      );
    }
  };

  const handleViewSquare = async () => {
    setShowBgSelector(false);
    setViewMode('square');
    setIsPaperReadOnly(false);
    await refreshSquarePapers();
    setIsFocused(true);
  };

  const handleViewSecret = () => {
    setShowBgSelector(false);
    setViewMode('secret');
    setSecretPapers([]);
    setSearchCode('');
    setIsPaperReadOnly(false);
    setIsFocused(true);
  };

  const handleSearchCode = async () => {
    if (!searchCode.trim()) return;
    const papers = await fetchPapersByCode(searchCode.trim());
    setSecretPapers(papers.map((paper) => ensureStructuredPaper(hydratePaper(paper), locale)));
  };

  const handleViewHistory = async () => {
    setShowBgSelector(false);
    setViewMode('history');
    setIsPaperReadOnly(false);
    const papers = await fetchUserPapers(authorID);
    setUserPapers(papers.map((paper) => ensureStructuredPaper(hydratePaper(paper), locale)));
    setIsFocused(true);
  };

  const handleNewPaper = () => {
    setEvent(createInitialEvent(locale, authorID));
    setDraft('');
    setAiErrorMessage(null);
    setViewMode('write');
    setIsFocused(true);
    setShowAIModal(false);
    setShowBgSelector(false);
    setIsPaperReadOnly(false);
  };

  const handleShareAgain = (paper: WhitepaperEvent) => {
    const sourcePaper = ensureStructuredPaper(hydratePaper(paper), locale);
    const nextPaper = withPaperAuthor(
      {
        ...sourcePaper,
        id: crypto.randomUUID(),
        isPublic: undefined,
        secretCode: undefined,
        collaboration: {
          authorID,
          isForked: true,
          originalEventID: paper.id,
          contributors: [authorID],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      authorID,
    );
    setEvent(nextPaper);
    setDraft(nextPaper.originalContent);
    setShowBgSelector(false);
    setIsPaperReadOnly(false);
    setShowPublishModal(true);
    setIsFocused(true);
  };

  const hasContent = hasStructuredContent(event);
  const showContent = isFocused || hasContent;
  const currentBgEffect = BACKGROUND_EFFECTS.find((bg) => bg.id === event.backgroundEffect) || BACKGROUND_EFFECTS[0];

  return (
    <>
      <main
        className={`min-h-screen flex items-center justify-center p-4 md:p-8 overflow-hidden relative ${currentBgEffect.cssClass || ''}`}
        style={{
          perspective: '2000px',
          backgroundColor: currentBgEffect.bgColor || '#262626',
        }}
        onClick={() => {
          setIsFocused(false);
          setShowBgSelector(false);
        }}
      >
        <div className="absolute inset-0 pointer-events-none z-0 effect-bg-layer" />

        {currentBgEffect.id === 'none' && (
          <div
            className="absolute inset-0 pointer-events-none opacity-20 z-0"
            style={{
              backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
        )}

        <div
          className="relative w-full max-w-[72vw] h-[76vh] md:max-w-[76vw] md:h-[80vh] transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] cursor-text flex flex-col rounded-[2px] effect-paper-layer z-10"
          style={{
            backgroundColor: '#fcfcfc',
            boxShadow: isFocused
              ? '0 20px 50px -10px rgba(0,0,0,0.3)'
              : '-30px 40px 70px -15px rgba(0,0,0,0.6), inset -1px -1px 3px rgba(0,0,0,0.05), inset 1px 1px 2px rgba(255,255,255,0.9)',
            transform: isFocused
              ? 'rotateX(0deg) rotateY(0deg) rotateZ(0deg) scale(1) translateY(0)'
              : 'rotateX(12deg) rotateY(-8deg) rotateZ(2deg) scale(0.92) translateY(10px)',
            transformStyle: 'preserve-3d',
          }}
          onClick={(mouseEvent) => {
            mouseEvent.stopPropagation();
            if (!isFocused) {
              setIsFocused(true);
            }
          }}
        >
          <div className="absolute inset-0 pointer-events-none rounded-[2px] z-20 effect-overlay-layer" />
          <div className="absolute inset-0 pointer-events-none z-50 effect-fg-layer" />

          <div
            className="absolute inset-0 pointer-events-none rounded-[2px]"
            style={{
              boxShadow: '0 0 0 1px rgba(0,0,0,0.03)',
              transform: 'translateZ(-1px)',
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none rounded-[2px]"
            style={{
              boxShadow: '0 0 0 1px rgba(0,0,0,0.03)',
              transform: 'translateZ(-2px)',
            }}
          />

          <div
            className={`p-8 md:p-16 flex flex-col h-full overflow-y-auto custom-scrollbar transition-opacity duration-500 z-30 relative ${showContent ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          >
            {viewMode === 'write' && (
              <>
                {event.aiGeneratedData ? (
                  <AIResults
                    event={event}
                    locale={locale}
                    isUnlocking={isUnlocking}
                    unlockVersion={unlockVersion}
                    layoutMode={event.layoutMode}
                    fontScale={event.fontScale}
                    editable={!isPaperReadOnly}
                    isRecordingAudio={isRecordingAudio}
                    onGeneratedDataChange={updateGeneratedData}
                    onLayoutModeChange={updateLayoutMode}
                    onFontScaleChange={updateFontScale}
                    onModuleTransformChange={updateModuleTransform}
                    onReferenceImageReplace={replaceReferenceImage}
                    onReferenceImageRemove={removeReferenceImage}
                    onReferenceImageTransform={transformReferenceImage}
                    onAddMediaItems={addImageFilesToPaper}
                    onUpdateMediaItem={updateMediaItem}
                    onReplaceMediaItem={replaceMediaItemFile}
                    onRemoveMediaItem={removeMediaItem}
                    onToggleAudioRecording={() => void toggleAudioRecording()}
                    onAddPaperNote={addPaperNote}
                    onUpdatePaperNote={updatePaperNote}
                    onRemovePaperNote={removePaperNote}
                  />
                ) : (
                  <article className="flex min-h-full flex-col">
                    <h1 className="mb-6 text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">
                      {event.title || tr('无题白纸', 'Untitled Blankpaper')}
                    </h1>
                    <div className="whitespace-pre-wrap text-lg leading-relaxed text-gray-800 md:text-xl">
                      {draft || event.originalContent || tr('这张白纸还没有写下更多内容。', 'There is nothing else written on this sheet yet.')}
                    </div>
                  </article>
                )}
              </>
            )}

            {viewMode === 'square' && (
              <div className="flex flex-col h-full">
                <div className="mb-8 flex items-center justify-between border-b-2 border-black/10 pb-4">
                  <h2 className="text-4xl font-bold text-gray-900">{tr('白纸广场', 'Blankpaper Square')}</h2>
                  {publicPapers.length > 0 && (
                    <button
                      onClick={refreshSquarePapers}
                      className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
                    >
                      {tr('换一批', 'Refresh')}
                    </button>
                  )}
                </div>
                {publicPapers.length === 0 ? (
                  <div className="flex-grow flex items-center justify-center text-gray-400">
                    {tr('广场上还没有白纸，去发布第一张吧！', 'There are no public sheets yet. Publish the first one.')}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-16">
                    {publicPapers.map((paper) => (
                      <div
                        key={paper.id}
                        onClick={() => openPaper(paper, true)}
                        className="bg-white p-6 rounded shadow-md border border-gray-100 hover:shadow-lg transition-shadow cursor-pointer"
                      >
                        <h3 className="text-xl font-bold mb-2 text-gray-900 line-clamp-2">{paper.title || tr('无题', 'Untitled')}</h3>
                        <p className="text-gray-600 line-clamp-4 text-sm">{getPaperPreview(paper, locale)}</p>
                        <div className="mt-4 text-xs text-gray-400 flex justify-between">
                          <span>{formatDisplayDate(paper.createdAt, locale)}</span>
                          <span>{tr('匿名发布', 'Anonymous')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {viewMode === 'secret' && (
              <div className="flex flex-col h-full max-w-2xl mx-auto w-full pt-12">
                <h2 className="text-4xl font-bold text-gray-900 mb-8 text-center">{tr('输入密令', 'Enter Secret Code')}</h2>
                <div className="flex gap-4 mb-12">
                  <input
                    type="text"
                    value={searchCode}
                    onChange={(inputEvent) => setSearchCode(inputEvent.target.value)}
                    placeholder={tr('请输入提取密令...', 'Enter the access code...')}
                    className="flex-grow bg-white border-2 border-gray-200 p-4 rounded-lg text-xl focus:border-black focus:outline-none transition-colors"
                  />
                  <button
                    onClick={handleSearchCode}
                    className="bg-black text-white px-8 py-4 rounded-lg font-bold hover:bg-gray-800 transition-colors"
                  >
                    {tr('查看', 'View')}
                  </button>
                </div>

                {secretPapers.length > 0 && (
                  <div className="flex flex-col gap-6 pb-16">
                    <h3 className="text-gray-500 font-medium mb-2">
                      {tr(`找到 ${secretPapers.length} 张白纸：`, `Found ${secretPapers.length} blankpaper sheet(s):`)}
                    </h3>
                    {secretPapers.map((paper) => (
                      <div
                        key={paper.id}
                        onClick={() => openPaper(paper, true)}
                        className="bg-white p-8 rounded shadow-md border border-gray-100 transition-shadow hover:shadow-lg cursor-pointer"
                      >
                        <h3 className="text-2xl font-bold mb-4 text-gray-900">{paper.title || tr('无题', 'Untitled')}</h3>
                        <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{getPaperPreview(paper, locale)}</p>
                        <div className="mt-6 text-xs text-gray-400 flex justify-between pt-4 border-t border-gray-100">
                          <span>{formatDisplayDate(paper.createdAt, locale)}</span>
                          <span>{tr(`来自密令: ${paper.secretCode}`, `From code: ${paper.secretCode}`)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {viewMode === 'history' && (
              <div className="flex flex-col h-full">
                <div className="flex justify-between items-center mb-8 border-b-2 border-black/10 pb-4">
                  <h2 className="text-4xl font-bold text-gray-900">{tr('我的白纸记录', 'My Blankpapers')}</h2>
                  <button
                    onClick={handleNewPaper}
                    className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg font-bold hover:bg-gray-800 transition-colors"
                  >
                    <PlusCircle size={18} />
                    {tr('新建白纸', 'New Sheet')}
                  </button>
                </div>

                {userPapers.length === 0 ? (
                  <div className="flex-grow flex items-center justify-center text-gray-400">
                    {tr('你还没有记录过任何白纸，现在就开始书写吧。', 'You have not recorded any blankpaper yet. Start writing now.')}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-16">
                    {userPapers.map((paper) => (
                      <div
                        key={paper.id}
                        onClick={() => openPaper(paper, false)}
                        className="bg-white p-6 rounded shadow-md border border-gray-100 flex flex-col hover:shadow-lg transition-shadow cursor-pointer"
                      >
                        <h3 className="text-xl font-bold mb-2 text-gray-900 line-clamp-2">{paper.title || tr('无题', 'Untitled')}</h3>
                        <p className="text-gray-600 line-clamp-3 text-sm flex-grow">{getPaperPreview(paper, locale)}</p>

                        <div className="mt-4 flex items-center justify-between border-t border-gray-50 pt-3">
                          <div className="text-xs text-gray-400 flex flex-col">
                            <span>{formatDisplayDate(paper.createdAt, locale)}</span>
                            <span>{paper.isPublic ? tr('已公开', 'Public') : tr(`私密密令: ${paper.secretCode}`, `Secret code: ${paper.secretCode}`)}</span>
                          </div>
                          <button
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              handleShareAgain(paper);
                            }}
                            className="flex items-center gap-1 text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded hover:bg-gray-200 transition-colors"
                          >
                            <Share2 size={14} />
                            {tr('再次分享', 'Share Again')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="fixed left-6 top-6 z-50" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            onClick={handleNewPaper}
            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/88 px-4 py-2 text-sm font-semibold text-gray-900 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur transition hover:bg-white"
          >
            <PlusCircle size={16} />
            {tr('新建白纸', 'New Sheet')}
          </button>
        </div>

        <div className="fixed right-6 top-6 z-50" onClick={(event) => event.stopPropagation()}>
          <div className="inline-flex items-center rounded-full border border-black/10 bg-white/85 p-1 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur">
            <button
              type="button"
              onClick={() => setLocale('zh')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${locale === 'zh' ? 'bg-black text-white' : 'text-gray-700 hover:bg-black/5'}`}
            >
              中文
            </button>
            <button
              type="button"
              onClick={() => setLocale('en')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${locale === 'en' ? 'bg-black text-white' : 'text-gray-700 hover:bg-black/5'}`}
            >
              EN
            </button>
          </div>
        </div>

        <div
          className="fixed bottom-6 left-6 z-50 flex items-end gap-3"
          onClick={(event) => event.stopPropagation()}
        >
          <div
            className={`overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
              isToolbarCollapsed ? 'pointer-events-none max-w-0 translate-x-4 opacity-0' : 'max-w-[calc(100vw-7rem)] translate-x-0 opacity-100'
            }`}
          >
            <div className="flex flex-wrap items-start gap-3">
              <FloatingActionButton
                onClick={() => {
                  setViewMode('write');
                  setIsFocused(true);
                }}
                active={viewMode === 'write'}
                title={tr('书写白纸', 'Write')}
                label={tr('书写', 'Write')}
              >
                <PenTool size={20} />
              </FloatingActionButton>
              <FloatingActionButton
                onClick={handleViewSquare}
                active={viewMode === 'square'}
                title={tr('白纸广场', 'Square')}
                label={tr('广场', 'Square')}
              >
                <Globe size={20} />
              </FloatingActionButton>
              <FloatingActionButton
                onClick={handleViewSecret}
                active={viewMode === 'secret'}
                title={tr('密令查看', 'Secret')}
                label={tr('密令', 'Secret')}
              >
                <KeyRound size={20} />
              </FloatingActionButton>
              <FloatingActionButton
                onClick={handleViewHistory}
                active={viewMode === 'history'}
                title={tr('我的白纸记录', 'History')}
                label={tr('记录', 'History')}
              >
                <History size={20} />
              </FloatingActionButton>

              {viewMode === 'write' && !isPaperReadOnly && (
                <FloatingActionButton
                  onClick={() => toolbarImageInputRef.current?.click()}
                  title={tr('添加图片到白纸', 'Add image to sheet')}
                  label={tr('图片', 'Image')}
                >
                  <ImagePlus size={18} />
                </FloatingActionButton>
              )}

              {viewMode === 'write' && !isPaperReadOnly && (
                <FloatingActionButton
                  onClick={() => void toggleAudioRecording()}
                  title={
                    isRecordingAudio
                      ? tr('结束录音并贴到白纸', 'Stop recording and pin it to the sheet')
                      : tr('开始录音并贴到白纸', 'Start recording and pin it to the sheet')
                  }
                  label={isRecordingAudio ? tr('停录', 'Stop') : tr('录音', 'Audio')}
                  tone={isRecordingAudio ? 'danger' : 'default'}
                >
                  {isRecordingAudio ? <Square size={16} /> : <Mic size={18} />}
                </FloatingActionButton>
              )}

              {viewMode === 'write' && !isPaperReadOnly && (
                <FloatingActionButton
                  onClick={() => {
                    setShowBgSelector(false);
                    setShowAIModal(false);
                    setShowPreviewModal(true);
                  }}
                  active={showPreviewModal}
                  title={tr('预览白纸', 'Preview sheet')}
                  label={tr('预览', 'Preview')}
                >
                  <Eye size={18} />
                </FloatingActionButton>
              )}

              {viewMode === 'write' && !isPaperReadOnly && (
                <FloatingActionButton
                  onClick={openAIModal}
                  disabled={isGenerating}
                  title={tr('AI 生成白纸', 'Generate with AI')}
                  label={tr('AI生成', 'AI')}
                  tone="dark"
                >
                  {isGenerating ? (
                    <div className="h-5 w-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  ) : (
                    <Sparkles size={18} />
                  )}
                </FloatingActionButton>
              )}

              {viewMode === 'write' && hasContent && !isPaperReadOnly && (
                <FloatingActionButton
                  onClick={() => {
                    setShowBgSelector(false);
                    setShowPublishModal(true);
                  }}
                  title={tr('发布白纸', 'Publish')}
                  label={tr('发布', 'Publish')}
                >
                  <Send size={18} />
                </FloatingActionButton>
              )}

              {viewMode === 'write' && !isPaperReadOnly && (
                <FloatingActionButton
                  onClick={() => setShowBgSelector((previous) => !previous)}
                  active={showBgSelector}
                  title={tr('设置背景特效', 'Background Effects')}
                  label={tr('背景', 'Effects')}
                >
                  <Palette size={20} />
                </FloatingActionButton>
              )}

            </div>
          </div>

          <FloatingActionButton
            onClick={() => setIsToolbarCollapsed((previous) => !previous)}
            title={isToolbarCollapsed ? tr('展开底部工具栏', 'Expand toolbar') : tr('收起底部工具栏', 'Collapse toolbar')}
            label={isToolbarCollapsed ? tr('展开', 'Open') : tr('收起', 'Hide')}
          >
            {isToolbarCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          </FloatingActionButton>
        </div>

        {showPublishModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowPublishModal(false)}>
            <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <h3 className="text-2xl font-bold mb-6 text-center text-gray-900">{tr('发布白纸', 'Publish Blankpaper')}</h3>

              {publishSuccess ? (
                <div className="text-center py-8 text-green-600 font-bold text-xl flex flex-col items-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                  {tr('发布成功！', 'Published successfully!')}
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  <div className="flex gap-4 p-1 bg-gray-100 rounded-lg">
                    <button
                      onClick={() => setIsPublic(true)}
                      className={`flex-1 py-2 rounded-md font-medium transition-colors ${isPublic ? 'bg-white shadow text-black' : 'text-gray-500'}`}
                    >
                      {tr('公开到广场', 'Public Square')}
                    </button>
                    <button
                      onClick={() => setIsPublic(false)}
                      className={`flex-1 py-2 rounded-md font-medium transition-colors ${!isPublic ? 'bg-white shadow text-black' : 'text-gray-500'}`}
                    >
                      {tr('私密 (设密令)', 'Private (Set Code)')}
                    </button>
                  </div>

                  {!isPublic && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{tr('设置密令', 'Set Access Code')}</label>
                      <input
                        type="text"
                        value={secretCode}
                        onChange={(inputEvent) => setSecretCode(inputEvent.target.value)}
                        placeholder={tr('输入密令，例如: 0808', 'Enter a code, for example: 0808')}
                        className="w-full border border-gray-300 rounded-lg p-3 focus:border-black focus:outline-none"
                      />
                      <p className="text-xs text-gray-500 mt-2">{tr('其他人输入此密令即可查看你的白纸。', 'Anyone with this code can view your blankpaper.')}</p>
                    </div>
                  )}

                  <div className="rounded-xl border border-gray-200 bg-[#faf5ea] px-4 py-3 text-sm leading-6 text-gray-600">
                    {tr(
                      '分享会直接继承这张白纸当前正在使用的背景特效，查看者打开时会看到同样的纸外环境，不需要在这里再次选择。',
                      'The shared sheet will keep its current background effect, so viewers will see the same outer-paper environment without choosing it again.',
                    )}
                  </div>

                  <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm flex gap-3 items-start">
                    <span className="text-lg">⚠️</span>
                    <p>
                      <strong>{tr('严禁发布违规内容', 'Prohibited Content Is Not Allowed')}</strong>
                      <br />
                      {tr(
                        '所有发布均为匿名。禁止发布黄赌毒等违法违规内容，平台将进行严格审核及屏蔽。',
                        'All publications are anonymous. Illegal or prohibited content is not allowed and may be blocked after review.',
                      )}
                    </p>
                  </div>

                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => setShowPublishModal(false)}
                      className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      {tr('取消', 'Cancel')}
                    </button>
                    <button
                      onClick={handlePublish}
                      disabled={!hasContent || (!isPublic && !secretCode.trim())}
                      className="flex-1 py-3 bg-black text-white font-bold rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      {tr('确认发布', 'Publish')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {showBgSelector && viewMode === 'write' && (
        <>
          <button
            type="button"
            aria-label={tr('关闭背景特效面板', 'Close background effects panel')}
            className="fixed inset-0 z-[115] bg-transparent"
            onClick={() => setShowBgSelector(false)}
          />
          <div
            className="fixed bottom-24 left-6 z-[120] isolate w-[min(24rem,calc(100vw-3rem))] overflow-hidden rounded-[28px] border border-black/8 p-4 shadow-[0_32px_80px_rgba(0,0,0,0.24)]"
            style={{ backgroundColor: '#faf5ea', contain: 'paint', transform: 'translateZ(0)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 border-b border-black/10 pb-3">
              <div className="text-base font-bold text-neutral-900">{tr('20 种特效 + 默认', '20 Effects + Default')}</div>
              <div className="mt-1 text-xs leading-5 text-black/45">
                {tr('只改变纸外环境，白纸内容和上传图片不再覆盖这个面板。', 'Only the outer-paper environment changes here. The paper content and uploaded images no longer cover this panel.')}
              </div>
            </div>

            <div className="grid max-h-[23rem] grid-cols-3 gap-3 overflow-y-auto pr-1 custom-scrollbar sm:grid-cols-4">
              {BACKGROUND_EFFECTS.map((background) => (
                <button
                  key={background.id}
                  onClick={() => {
                    setEvent((previous) => ({ ...previous, backgroundEffect: background.id }));
                    setShowBgSelector(false);
                  }}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl p-2 transition-all ${event.backgroundEffect === background.id ? 'bg-black/6 ring-1 ring-black' : 'hover:bg-white/70'}`}
                >
                  <div
                    className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-gray-200 shadow-inner"
                    style={getEffectPreviewStyle(background.id, background.bgColor)}
                  />
                  <span className="w-full truncate text-center text-[10px] text-gray-600">
                    {getEffectLabel(background.id, locale, background.name)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <AIGenerateModal
        open={showAIModal}
        locale={locale}
        initialTitle={event.title}
        initialPrompt={draft}
        isGenerating={isGenerating}
        errorMessage={aiErrorMessage}
        onClose={() => {
          if (isGenerating) return;
          setShowAIModal(false);
        }}
        onSubmit={handleGenerate}
      />
      {showPreviewModal && viewMode === 'write' && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 backdrop-blur-md" onClick={() => setShowPreviewModal(false)}>
          <div
            className={`relative flex h-[100dvh] w-full items-center justify-center overflow-hidden p-4 md:p-8 ${currentBgEffect.cssClass || ''}`}
            style={{ backgroundColor: currentBgEffect.bgColor || '#262626' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute inset-0 pointer-events-none z-0 effect-bg-layer" />

            {currentBgEffect.id === 'none' && (
              <div
                className="absolute inset-0 pointer-events-none opacity-20 z-0"
                style={{
                  backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
              />
            )}

            <button
              type="button"
              onClick={() => setShowPreviewModal(false)}
              className="absolute right-5 top-5 z-[150] inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-white/85 text-black shadow-lg transition hover:bg-white"
              title={tr('关闭预览', 'Close preview')}
            >
              <X size={20} />
            </button>

            <div className="pointer-events-none absolute left-5 top-5 z-[150] rounded-full border border-white/20 bg-black/45 px-4 py-2 text-xs font-medium tracking-[0.24em] text-white/90 backdrop-blur-sm">
              {tr('白纸预览', 'SHEET PREVIEW')}
            </div>

            <div
              className="relative w-full max-w-[84vw] h-[84vh] md:max-w-[82vw] md:h-[86vh] flex flex-col rounded-[2px] effect-paper-layer z-10"
              style={{
                backgroundColor: '#fcfcfc',
                boxShadow: '0 32px 90px -24px rgba(0,0,0,0.48), inset -1px -1px 3px rgba(0,0,0,0.05), inset 1px 1px 2px rgba(255,255,255,0.9)',
              }}
            >
              <div className="absolute inset-0 pointer-events-none rounded-[2px] z-20 effect-overlay-layer" />
              <div className="absolute inset-0 pointer-events-none z-50 effect-fg-layer" />
              <div
                className="absolute inset-0 pointer-events-none rounded-[2px]"
                style={{
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.03)',
                  transform: 'translateZ(-1px)',
                }}
              />
              <div
                className="absolute inset-0 pointer-events-none rounded-[2px]"
                style={{
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.03)',
                  transform: 'translateZ(-2px)',
                }}
              />

              <div className="p-8 md:p-16 flex flex-col h-full overflow-y-auto custom-scrollbar z-30 relative">
                {event.aiGeneratedData ? (
                  <AIResults
                    event={event}
                    locale={locale}
                    isUnlocking={false}
                    unlockVersion={unlockVersion}
                    layoutMode={event.layoutMode}
                    fontScale={event.fontScale}
                    editable={false}
                    isRecordingAudio={false}
                  />
                ) : (
                  <article className="flex min-h-full flex-col">
                    <h1 className="mb-6 text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">
                      {event.title || tr('无题白纸', 'Untitled Blankpaper')}
                    </h1>
                    <div className="whitespace-pre-wrap text-lg leading-relaxed text-gray-800 md:text-xl">
                      {draft || event.originalContent || tr('这张白纸还没有写下更多内容。', 'There is nothing else written on this sheet yet.')}
                    </div>
                  </article>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <input
        ref={toolbarImageInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          void handleToolbarImageSelect(event);
        }}
      />
    </>
  );
}
