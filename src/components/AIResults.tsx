import { CSSProperties, ChangeEvent, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { AIGeneratedData, WhitepaperEvent, WhitepaperMediaItem, WhitepaperNote, WhitepaperReferenceImage, PaperLayoutMode, PaperLayoutPreset, PaperModuleKey, PaperModuleTransform } from '@/types';
import { CalendarDays, ImagePlus, MessageSquarePlus, Mic, Move, NotebookText, RotateCcw, RotateCw, Sparkles, Trash2, Volume2, ZoomIn, ZoomOut } from 'lucide-react';
import { formatDisplayDate } from '@/utils/dateFormat';
import { Locale, translate } from '@/utils/locale';
import { resolvePaperLayout } from '@/utils/paperLayout';

interface AIResultsProps {
  event: WhitepaperEvent;
  locale: Locale;
  isUnlocking: boolean;
  unlockVersion: number;
  layoutMode?: PaperLayoutMode;
  fontScale?: number;
  editable?: boolean;
  isRecordingAudio?: boolean;
  onGeneratedDataChange?: (updater: (data: AIGeneratedData) => AIGeneratedData) => void;
  onLayoutModeChange?: (layoutMode: PaperLayoutMode) => void;
  onFontScaleChange?: (fontScale: number) => void;
  onModuleTransformChange?: (moduleKey: PaperModuleKey, updater: (transform: PaperModuleTransform) => PaperModuleTransform) => void;
  onReferenceImageReplace?: (file: File) => void | Promise<void>;
  onReferenceImageRemove?: () => void;
  onReferenceImageTransform?: (updater: (image: WhitepaperReferenceImage) => WhitepaperReferenceImage) => void;
  onAddMediaItems?: (files: File[]) => void | Promise<void>;
  onUpdateMediaItem?: (mediaItemID: string, updater: (item: WhitepaperMediaItem) => WhitepaperMediaItem) => void;
  onReplaceMediaItem?: (mediaItemID: string, file: File) => void | Promise<void>;
  onRemoveMediaItem?: (mediaItemID: string) => void;
  onToggleAudioRecording?: () => void;
  onAddPaperNote?: () => void;
  onUpdatePaperNote?: (noteID: string, updater: (note: WhitepaperNote) => WhitepaperNote) => void;
  onRemovePaperNote?: (noteID: string) => void;
}

interface EditableTextProps {
  editable: boolean;
  value: string;
  rows?: number;
  placeholder?: string;
  className: string;
  editingClassName?: string;
  style?: CSSProperties;
  editingStyle?: CSSProperties;
  onChange?: (value: string) => void;
}

type PaperAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type PhysicalMotion = {
  tiltX: number;
  tiltY: number;
  scale: number;
  shiftX: number;
  shiftY: number;
};
type ReleaseVelocity = {
  x: number;
  y: number;
};
type BoardRect = {
  id: string;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};
type AlignmentGuides = {
  vertical: number | null;
  horizontal: number | null;
};
type SnapCandidate = {
  offset: number;
  guide: number;
};

const IMAGE_SNAP_X_POINTS = [-72, 0, 72];
const IMAGE_SNAP_Y_POINTS = [-24, 0, 36];
const IMAGE_SNAP_THRESHOLD = 20;
const NOTE_EDGE_SNAP_THRESHOLD = 24;
const NOTE_COLUMN_SNAP_THRESHOLD = 22;
const MEDIA_EDGE_SNAP_THRESHOLD = 24;
const MEDIA_COLUMN_SNAP_THRESHOLD = 24;
const REFERENCE_ANCHOR_PRESETS: Record<PaperAnchor, { offsetX: number; offsetY: number; rotation: number }> = {
  'top-left': { offsetX: -72, offsetY: -24, rotation: -7 },
  'top-right': { offsetX: 72, offsetY: -24, rotation: 6 },
  'bottom-left': { offsetX: -72, offsetY: 36, rotation: -3 },
  'bottom-right': { offsetX: 72, offsetY: 36, rotation: 5 },
};
const NOTE_ANCHOR_ROTATIONS: Record<PaperAnchor, number> = {
  'top-left': -6,
  'top-right': 6,
  'bottom-left': -2,
  'bottom-right': 5,
};
const ZERO_PHYSICAL_MOTION: PhysicalMotion = {
  tiltX: 0,
  tiltY: 0,
  scale: 1,
  shiftX: 0,
  shiftY: 0,
};
const PAPER_LAYOUT_BUTTONS: PaperLayoutMode[] = ['minimal', 'ai', 'editorial', 'evidence', 'timeline', 'scrapbook'];
const MODULE_KEYS: PaperModuleKey[] = ['lead', 'body', 'reference', 'media', 'factCards', 'timeline', 'notes', 'closing'];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const snapToClosestPoint = (value: number, points: number[], threshold: number) => {
  const closestPoint = points.reduce((currentClosest, point) =>
    Math.abs(point - value) < Math.abs(currentClosest - value) ? point : currentClosest,
  points[0]);

  return Math.abs(closestPoint - value) <= threshold ? closestPoint : value;
};

const resolveSnapCandidate = (
  value: number,
  candidates: SnapCandidate[],
  threshold: number,
  maxOffset: number,
) => {
  if (candidates.length === 0) {
    return {
      offset: clamp(value, 0, maxOffset),
      guide: null as number | null,
    };
  }

  const normalized = candidates.map((candidate) => ({
    offset: clamp(candidate.offset, 0, maxOffset),
    guide: candidate.guide,
  }));
  const closest = normalized.reduce((best, candidate) =>
    Math.abs(candidate.offset - value) < Math.abs(best.offset - value) ? candidate : best,
  normalized[0]);

  if (Math.abs(closest.offset - value) <= threshold) {
    return {
      offset: closest.offset,
      guide: closest.guide,
    };
  }

  return {
    offset: clamp(value, 0, maxOffset),
    guide: null as number | null,
  };
};

const buildPaperShadow = (rotation: number, layer: 'front' | 'back', profile: 'figure' | 'note') => {
  const direction = rotation >= 0 ? 1 : -1;
  const absRotation = Math.min(Math.abs(rotation), 12);
  const lift = layer === 'front' ? 1 : 0.66;
  const shadowX = Math.round(direction * ((profile === 'figure' ? 8 : 5) + absRotation * (profile === 'figure' ? 0.85 : 0.55)));
  const shadowY = Math.round((profile === 'figure' ? 22 : 16) * lift + absRotation * (profile === 'figure' ? 1.2 : 0.8));
  const blur = Math.round((profile === 'figure' ? 50 : 34) * lift + absRotation * 2);
  const spread = Math.round(-(profile === 'figure' ? 28 : 22) * lift);
  const opacity = ((profile === 'figure' ? 0.26 : 0.22) * lift + absRotation * 0.007).toFixed(3);
  const ambientOpacity = (0.08 * lift).toFixed(3);
  const insetOpacity = (layer === 'front' ? 0.74 : 0.58).toFixed(2);

  return `${shadowX}px ${shadowY}px ${blur}px ${spread}px rgba(0,0,0,${opacity}), 0 ${Math.round(6 * lift)}px ${Math.round(18 * lift)}px -${Math.round(14 * lift)}px rgba(0,0,0,${ambientOpacity}), inset 0 1px 0 rgba(255,255,255,${insetOpacity})`;
};

const buildSurfaceShadow = (rotation: number, layer: 'front' | 'back') => {
  const direction = rotation >= 0 ? 1 : -1;
  const absRotation = Math.min(Math.abs(rotation), 12);
  const lift = layer === 'front' ? 1 : 0.7;
  const shadowX = Math.round(direction * (4 + absRotation * 0.32));
  const shadowY = Math.round(16 * lift + absRotation * 0.55);
  const blur = Math.round(34 * lift + absRotation * 1.5);
  const spread = Math.round(-20 * lift);
  const opacity = (0.18 * lift + absRotation * 0.005).toFixed(3);

  return `${shadowX}px ${shadowY}px ${blur}px ${spread}px rgba(0,0,0,${opacity})`;
};

const derivePhysicalMotion = (deltaX: number, deltaY: number): PhysicalMotion => {
  const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

  return {
    tiltX: clamp(deltaY / 22, -6, 6),
    tiltY: clamp(-deltaX / 18, -8, 8),
    scale: 1 + Math.min(distance / 1600, 0.04),
    shiftX: 0,
    shiftY: 0,
  };
};

const deriveSettleMotion = (motion: PhysicalMotion, velocity: ReleaseVelocity): PhysicalMotion => ({
  tiltX: clamp(motion.tiltX * -0.45 + velocity.y * -0.16, -5.5, 5.5),
  tiltY: clamp(motion.tiltY * -0.45 + velocity.x * 0.18, -7.5, 7.5),
  scale: clamp(0.992 + Math.min((Math.abs(velocity.x) + Math.abs(velocity.y)) / 900, 0.02), 0.99, 1.02),
  shiftX: clamp(motion.tiltY * -1.6 + velocity.x * 3.2, -22, 22),
  shiftY: clamp(motion.tiltX * 1.4 + velocity.y * 2.8, -18, 18),
});

const buildPhysicalTransform = (
  offsetX: number,
  offsetY: number,
  rotation: number,
  scale: number,
  motion: PhysicalMotion,
) =>
  `translate(${offsetX + motion.shiftX}px, ${offsetY + motion.shiftY}px) rotate(${rotation}deg) rotateX(${motion.tiltX}deg) rotateY(${motion.tiltY}deg) scale(${(scale * motion.scale).toFixed(3)})`;

const intersectsRect = (current: BoardRect, other: BoardRect) =>
  current.offsetX < other.offsetX + other.width &&
  current.offsetX + current.width > other.offsetX &&
  current.offsetY < other.offsetY + other.height &&
  current.offsetY + current.height > other.offsetY;

const resolveBoardCollisions = (current: BoardRect, siblings: BoardRect[], maxX: number, maxY: number) => {
  let nextX = current.offsetX;
  let nextY = current.offsetY;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const nextRect = { ...current, offsetX: nextX, offsetY: nextY };
    const collision = siblings.find((item) => intersectsRect(nextRect, item));

    if (!collision) break;

    const overlapX = Math.min(nextRect.offsetX + nextRect.width, collision.offsetX + collision.width) - Math.max(nextRect.offsetX, collision.offsetX);
    const overlapY = Math.min(nextRect.offsetY + nextRect.height, collision.offsetY + collision.height) - Math.max(nextRect.offsetY, collision.offsetY);
    const moveRight = nextRect.offsetX + nextRect.width / 2 >= collision.offsetX + collision.width / 2;
    const moveDown = nextRect.offsetY + nextRect.height / 2 >= collision.offsetY + collision.height / 2;

    if (overlapX <= overlapY) {
      nextX += (moveRight ? 1 : -1) * (overlapX + 14);
    } else {
      nextY += (moveDown ? 1 : -1) * (overlapY + 14);
    }

    nextX = clamp(Math.round(nextX), 0, maxX);
    nextY = clamp(Math.round(nextY), 0, maxY);
  }

  return {
    offsetX: nextX,
    offsetY: nextY,
  };
};

function EditableText({
  editable,
  value,
  rows = 1,
  placeholder,
  className,
  editingClassName,
  style,
  editingStyle,
  onChange,
}: EditableTextProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editable || !textareaRef.current) return;

    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
  }, [editable, value]);

  if (!editable) {
    if (!value.trim()) return null;
    return <div className={className} style={style}>{value}</div>;
  }

  return (
    <textarea
      ref={textareaRef}
      rows={rows}
      value={value}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(event) => onChange?.(event.target.value)}
      style={editingStyle || style}
      className={editingClassName || `${className} w-full resize-none overflow-hidden rounded-2xl border border-black/8 bg-white/55 px-3 py-2 outline-none transition placeholder:text-black/25 focus:border-black/20 focus:bg-white/75`}
    />
  );
}

export function AIResults({
  event,
  locale,
  isUnlocking,
  unlockVersion,
  layoutMode,
  fontScale = 1,
  editable = false,
  isRecordingAudio = false,
  onGeneratedDataChange,
  onLayoutModeChange,
  onFontScaleChange,
  onModuleTransformChange,
  onReferenceImageReplace,
  onReferenceImageRemove,
  onReferenceImageTransform,
  onAddMediaItems,
  onUpdateMediaItem,
  onReplaceMediaItem,
  onRemoveMediaItem,
  onToggleAudioRecording,
  onAddPaperNote,
  onUpdatePaperNote,
  onRemovePaperNote,
}: AIResultsProps) {
  const { aiGeneratedData } = event;
  const referenceImage = event.referenceImage;
  const resultShellRef = useRef<HTMLDivElement>(null);
  const mediaBoardRef = useRef<HTMLDivElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const noteBoardRef = useRef<HTMLDivElement>(null);
  const moduleRefs = useRef<Partial<Record<PaperModuleKey, HTMLDivElement | null>>>({});
  const settleTimersRef = useRef<number[]>([]);
  const [isReferenceDragging, setIsReferenceDragging] = useState(false);
  const [isReferenceSettling, setIsReferenceSettling] = useState(false);
  const [referenceMotion, setReferenceMotion] = useState<PhysicalMotion>(ZERO_PHYSICAL_MOTION);
  const referenceMotionRef = useRef<PhysicalMotion>(ZERO_PHYSICAL_MOTION);
  const [draggingMediaID, setDraggingMediaID] = useState<string | null>(null);
  const [settlingMediaIDs, setSettlingMediaIDs] = useState<string[]>([]);
  const [mediaMotions, setMediaMotions] = useState<Record<string, PhysicalMotion>>({});
  const mediaMotionsRef = useRef<Record<string, PhysicalMotion>>({});
  const [draggingNoteID, setDraggingNoteID] = useState<string | null>(null);
  const [settlingNoteIDs, setSettlingNoteIDs] = useState<string[]>([]);
  const [noteMotions, setNoteMotions] = useState<Record<string, PhysicalMotion>>({});
  const noteMotionsRef = useRef<Record<string, PhysicalMotion>>({});
  const [draggingModuleKey, setDraggingModuleKey] = useState<PaperModuleKey | null>(null);
  const [settlingModuleKeys, setSettlingModuleKeys] = useState<PaperModuleKey[]>([]);
  const [moduleMotions, setModuleMotions] = useState<Record<string, PhysicalMotion>>({});
  const moduleMotionsRef = useRef<Record<string, PhysicalMotion>>({});
  const [moduleGuides, setModuleGuides] = useState<AlignmentGuides>({
    vertical: null,
    horizontal: null,
  });
  const tr = (zh: string, en: string) => translate(locale, zh, en);
  const clampFontScale = (value: number) => Math.min(1.3, Math.max(0.84, Number(value.toFixed(2))));
  const scaleFont = (base: string) => ({ fontSize: `calc(${base} * ${fontScale})` });
  const shiftFontScale = (delta: number) => onFontScaleChange?.(clampFontScale(fontScale + delta));
  const getLayoutLabel = (mode: PaperLayoutMode | PaperLayoutPreset) => {
    switch (mode) {
      case 'ai':
        return tr('AI 荐', 'AI Pick');
      case 'editorial':
        return tr('叙事', 'Editorial');
      case 'evidence':
        return tr('贴图', 'Evidence');
      case 'timeline':
        return tr('时序', 'Timeline');
      case 'scrapbook':
        return tr('拼贴', 'Scrapbook');
      case 'minimal':
      default:
        return tr('极简', 'Minimal');
    }
  };

  const queueTransientState = (
    applyState: () => void,
    clearState: () => void,
    duration = 420,
  ) => {
    applyState();
    const timer = window.setTimeout(() => {
      clearState();
      settleTimersRef.current = settleTimersRef.current.filter((item) => item !== timer);
    }, duration);
    settleTimersRef.current.push(timer);
  };

  useEffect(() => {
    return () => {
      settleTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const setReferenceMotionState = (motion: PhysicalMotion) => {
    referenceMotionRef.current = motion;
    setReferenceMotion(motion);
  };

  const setMediaMotionState = (mediaItemID: string, motion: PhysicalMotion) => {
    mediaMotionsRef.current = {
      ...mediaMotionsRef.current,
      [mediaItemID]: motion,
    };
    setMediaMotions(mediaMotionsRef.current);
  };

  const setNoteMotionState = (noteID: string, motion: PhysicalMotion) => {
    noteMotionsRef.current = {
      ...noteMotionsRef.current,
      [noteID]: motion,
    };
    setNoteMotions(noteMotionsRef.current);
  };

  const setModuleMotionState = (moduleKey: PaperModuleKey, motion: PhysicalMotion) => {
    moduleMotionsRef.current = {
      ...moduleMotionsRef.current,
      [moduleKey]: motion,
    };
    setModuleMotions(moduleMotionsRef.current);
  };

  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    baseOffsetX: number;
    baseOffsetY: number;
    lastClientX: number;
    lastClientY: number;
    lastTimestamp: number;
    velocityX: number;
    velocityY: number;
  } | null>(null);

  const mediaDragStateRef = useRef<{
    pointerId: number;
    mediaItemID: string;
    startX: number;
    startY: number;
    baseOffsetX: number;
    baseOffsetY: number;
    lastClientX: number;
    lastClientY: number;
    lastTimestamp: number;
    velocityX: number;
    velocityY: number;
  } | null>(null);

  const noteDragStateRef = useRef<{
    pointerId: number;
    noteID: string;
    startX: number;
    startY: number;
    baseOffsetX: number;
    baseOffsetY: number;
    lastClientX: number;
    lastClientY: number;
    lastTimestamp: number;
    velocityX: number;
    velocityY: number;
  } | null>(null);

  const moduleDragStateRef = useRef<{
    pointerId: number;
    moduleKey: PaperModuleKey;
    startX: number;
    startY: number;
    baseOffsetX: number;
    baseOffsetY: number;
    lastClientX: number;
    lastClientY: number;
    lastTimestamp: number;
    velocityX: number;
    velocityY: number;
  } | null>(null);

  if (!aiGeneratedData) return null;

  const updateField = <K extends keyof AIGeneratedData>(key: K, value: AIGeneratedData[K]) => {
    onGeneratedDataChange?.((data) => ({
      ...data,
      [key]: value,
    }));
  };

  const updateModuleTransform = (moduleKey: PaperModuleKey, updater: (transform: PaperModuleTransform) => PaperModuleTransform) => {
    onModuleTransformChange?.(moduleKey, updater);
  };

  const getModuleTransform = (moduleKey: PaperModuleKey): PaperModuleTransform =>
    event.moduleTransforms?.[moduleKey] || {
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      layer: 'front',
    };

  const updateArrayItem = (key: 'handwrittenBody' | 'observations', index: number, value: string) => {
    onGeneratedDataChange?.((data) => ({
      ...data,
      [key]: data[key].map((item, itemIndex) => (itemIndex === index ? value : item)),
    }));
  };

  const updateFactCard = (index: number, field: 'label' | 'value', value: string) => {
    onGeneratedDataChange?.((data) => ({
      ...data,
      factCards: data.factCards.map((card, cardIndex) =>
        cardIndex === index
          ? {
              ...card,
              [field]: value,
            }
          : card,
      ),
    }));
  };

  const updateTimeline = (index: number, field: 'dateString' | 'description', value: string) => {
    onGeneratedDataChange?.((data) => ({
      ...data,
      timeline: data.timeline.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    }));
  };

  const addBodyParagraph = () => {
    onGeneratedDataChange?.((data) => ({
      ...data,
      handwrittenBody: [...data.handwrittenBody, ''],
    }));
  };

  const removeBodyParagraph = (index: number) => {
    onGeneratedDataChange?.((data) => ({
      ...data,
      handwrittenBody: data.handwrittenBody.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const addFactCard = () => {
    onGeneratedDataChange?.((data) => ({
      ...data,
      factCards: [
        ...data.factCards,
        {
          id: crypto.randomUUID(),
          label: tr('补充', 'Extra'),
          value: '',
        },
      ],
    }));
  };

  const removeFactCard = (index: number) => {
    onGeneratedDataChange?.((data) => ({
      ...data,
      factCards: data.factCards.filter((_, cardIndex) => cardIndex !== index),
    }));
  };

  const addTimelineItem = () => {
    onGeneratedDataChange?.((data) => ({
      ...data,
      timeline: [
        ...data.timeline,
        {
          id: crypto.randomUUID(),
          dateString: '',
          description: '',
        },
      ],
    }));
  };

  const removeTimelineItem = (index: number) => {
    onGeneratedDataChange?.((data) => ({
      ...data,
      timeline: data.timeline.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const addObservation = () => {
    onGeneratedDataChange?.((data) => ({
      ...data,
      observations: [...data.observations, ''],
    }));
  };

  const removeObservation = (index: number) => {
    onGeneratedDataChange?.((data) => ({
      ...data,
      observations: data.observations.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleReferenceImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (file) {
      void onReferenceImageReplace?.(file);
    }
  };

  const handleMediaAddChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';

    if (files.length > 0) {
      void onAddMediaItems?.(files);
    }
  };

  const handleMediaReplaceChange = (mediaItemID: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (file) {
      void onReplaceMediaItem?.(mediaItemID, file);
    }
  };

  const updateReferenceTransform = (updater: (image: WhitepaperReferenceImage) => WhitepaperReferenceImage) => {
    onReferenceImageTransform?.(updater);
  };

  const snapReferenceImagePosition = () => {
    updateReferenceTransform((image) => {
      const nextOffsetX = Math.round(snapToClosestPoint(clamp(image.offsetX ?? 0, -96, 96), IMAGE_SNAP_X_POINTS, IMAGE_SNAP_THRESHOLD));
      const nextOffsetY = Math.round(snapToClosestPoint(clamp(image.offsetY ?? 0, -36, 52), IMAGE_SNAP_Y_POINTS, IMAGE_SNAP_THRESHOLD - 2));
      const matchedAnchor = (Object.entries(REFERENCE_ANCHOR_PRESETS) as [PaperAnchor, { offsetX: number; offsetY: number; rotation: number }][]).find(
        ([, preset]) => preset.offsetX === nextOffsetX && preset.offsetY === nextOffsetY,
      );

      return {
        ...image,
        offsetX: nextOffsetX,
        offsetY: nextOffsetY,
        rotation: matchedAnchor ? matchedAnchor[1].rotation : image.rotation,
      };
    });
  };

  const placeReferenceImageAtAnchor = (anchor: PaperAnchor) => {
    const preset = REFERENCE_ANCHOR_PRESETS[anchor];

    updateReferenceTransform((image) => ({
      ...image,
      offsetX: preset.offsetX,
      offsetY: preset.offsetY,
      rotation: preset.rotation,
    }));
  };

  const handleReferencePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editable || !referenceImage?.src) return;
    setIsReferenceDragging(true);
    setIsReferenceSettling(false);
    setReferenceMotionState(ZERO_PHYSICAL_MOTION);

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseOffsetX: referenceImage.offsetX ?? 0,
      baseOffsetY: referenceImage.offsetY ?? 0,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastTimestamp: event.timeStamp,
      velocityX: 0,
      velocityY: 0,
    };

    const nextTarget = event.currentTarget;
    nextTarget.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!dragStateRef.current || moveEvent.pointerId !== dragStateRef.current.pointerId) return;

      const deltaX = moveEvent.clientX - dragStateRef.current.startX;
      const deltaY = moveEvent.clientY - dragStateRef.current.startY;
      const elapsed = Math.max(moveEvent.timeStamp - dragStateRef.current.lastTimestamp, 1);
      dragStateRef.current.velocityX = (moveEvent.clientX - dragStateRef.current.lastClientX) / elapsed;
      dragStateRef.current.velocityY = (moveEvent.clientY - dragStateRef.current.lastClientY) / elapsed;
      dragStateRef.current.lastClientX = moveEvent.clientX;
      dragStateRef.current.lastClientY = moveEvent.clientY;
      dragStateRef.current.lastTimestamp = moveEvent.timeStamp;
      const nextMotion = derivePhysicalMotion(deltaX, deltaY);
      setReferenceMotionState(nextMotion);

      updateReferenceTransform((image) => ({
        ...image,
        offsetX: dragStateRef.current!.baseOffsetX + deltaX,
        offsetY: dragStateRef.current!.baseOffsetY + deltaY,
      }));
    };

    const clearDrag = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      dragStateRef.current = null;
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (!dragStateRef.current || upEvent.pointerId !== dragStateRef.current.pointerId) return;
      const settleMotion = deriveSettleMotion(referenceMotionRef.current, {
        x: dragStateRef.current.velocityX,
        y: dragStateRef.current.velocityY,
      });
      snapReferenceImagePosition();
      setIsReferenceDragging(false);
      queueTransientState(
        () => {
          setReferenceMotionState(settleMotion);
          setIsReferenceSettling(true);
        },
        () => {
          setReferenceMotionState(ZERO_PHYSICAL_MOTION);
          setIsReferenceSettling(false);
        },
      );
      clearDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const updateMediaItem = (mediaItemID: string, updater: (item: WhitepaperMediaItem) => WhitepaperMediaItem) => {
    onUpdateMediaItem?.(mediaItemID, updater);
  };

  const snapMediaItemPosition = (mediaItemID: string, mediaElement?: HTMLElement | null) => {
    const mediaBoard = mediaBoardRef.current;
    if (!mediaBoard) return;

    const cardWidth = mediaElement?.offsetWidth ?? 216;
    const cardHeight = mediaElement?.offsetHeight ?? 286;
    const maxX = Math.max(0, mediaBoard.clientWidth - cardWidth - 8);
    const maxY = Math.max(0, mediaBoard.clientHeight - cardHeight - 8);
    const mediaColumns = [0, Math.round(maxX / 2), maxX].filter((value, index, values) => values.indexOf(value) === index);

    updateMediaItem(mediaItemID, (currentItem) => {
      let nextX = clamp(currentItem.offsetX, 0, maxX);
      let nextY = clamp(currentItem.offsetY, 0, maxY);

      nextX = snapToClosestPoint(nextX, mediaColumns, MEDIA_COLUMN_SNAP_THRESHOLD);
      nextY = snapToClosestPoint(nextY, [0, maxY], MEDIA_EDGE_SNAP_THRESHOLD);

      if (nextX <= MEDIA_EDGE_SNAP_THRESHOLD) nextX = 0;
      if (maxX - nextX <= MEDIA_EDGE_SNAP_THRESHOLD) nextX = maxX;
      if (nextY <= MEDIA_EDGE_SNAP_THRESHOLD) nextY = 0;
      if (maxY - nextY <= MEDIA_EDGE_SNAP_THRESHOLD) nextY = maxY;
      const resolved = resolveBoardCollisions(
        {
          id: mediaItemID,
          offsetX: nextX,
          offsetY: nextY,
          width: cardWidth,
          height: cardHeight,
        },
        mediaItems
          .filter((item) => item.id !== mediaItemID)
          .map((item) => ({
            id: item.id,
            offsetX: item.offsetX,
            offsetY: item.offsetY,
            width: cardWidth,
            height: cardHeight,
          })),
        maxX,
        maxY,
      );
      nextX = resolved.offsetX;
      nextY = resolved.offsetY;

      const matchedAnchor =
        nextX === 0 && nextY === 0
          ? 'top-left'
          : nextX === maxX && nextY === 0
            ? 'top-right'
            : nextX === 0 && nextY === maxY
              ? 'bottom-left'
              : nextX === maxX && nextY === maxY
                ? 'bottom-right'
                : null;

      return {
        ...currentItem,
        offsetX: Math.round(nextX),
        offsetY: Math.round(nextY),
        rotation: matchedAnchor ? NOTE_ANCHOR_ROTATIONS[matchedAnchor] : currentItem.rotation,
      };
    });
  };

  const placeMediaItemAtAnchor = (mediaItemID: string, anchor: PaperAnchor, mediaElement?: HTMLElement | null) => {
    const mediaBoard = mediaBoardRef.current;
    if (!mediaBoard) return;

    const fallbackNode = mediaBoard.querySelector<HTMLElement>(`[data-media-id="${mediaItemID}"]`);
    const activeNode = mediaElement || fallbackNode;
    const cardWidth = activeNode?.offsetWidth ?? 216;
    const cardHeight = activeNode?.offsetHeight ?? 286;
    const maxX = Math.max(0, mediaBoard.clientWidth - cardWidth - 8);
    const maxY = Math.max(0, mediaBoard.clientHeight - cardHeight - 8);

    const nextOffsets =
      anchor === 'top-left'
        ? { offsetX: 0, offsetY: 0 }
        : anchor === 'top-right'
          ? { offsetX: maxX, offsetY: 0 }
          : anchor === 'bottom-left'
            ? { offsetX: 0, offsetY: maxY }
            : { offsetX: maxX, offsetY: maxY };

    updateMediaItem(mediaItemID, (currentItem) => ({
      ...currentItem,
      ...nextOffsets,
      rotation: NOTE_ANCHOR_ROTATIONS[anchor],
    }));
  };

  const handleMediaPointerDown = (mediaItem: WhitepaperMediaItem, event: ReactPointerEvent<HTMLElement>) => {
    if (!editable) return;
    setDraggingMediaID(mediaItem.id);
    setSettlingMediaIDs((previous) => previous.filter((item) => item !== mediaItem.id));
    setMediaMotionState(mediaItem.id, ZERO_PHYSICAL_MOTION);
    const mediaElement = event.currentTarget.closest('[data-media-id]') as HTMLElement | null;

    mediaDragStateRef.current = {
      pointerId: event.pointerId,
      mediaItemID: mediaItem.id,
      startX: event.clientX,
      startY: event.clientY,
      baseOffsetX: mediaItem.offsetX,
      baseOffsetY: mediaItem.offsetY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastTimestamp: event.timeStamp,
      velocityX: 0,
      velocityY: 0,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (
        !mediaDragStateRef.current ||
        mediaDragStateRef.current.mediaItemID !== mediaItem.id ||
        moveEvent.pointerId !== mediaDragStateRef.current.pointerId
      ) {
        return;
      }

      const deltaX = moveEvent.clientX - mediaDragStateRef.current.startX;
      const deltaY = moveEvent.clientY - mediaDragStateRef.current.startY;
      const elapsed = Math.max(moveEvent.timeStamp - mediaDragStateRef.current.lastTimestamp, 1);
      mediaDragStateRef.current.velocityX = (moveEvent.clientX - mediaDragStateRef.current.lastClientX) / elapsed;
      mediaDragStateRef.current.velocityY = (moveEvent.clientY - mediaDragStateRef.current.lastClientY) / elapsed;
      mediaDragStateRef.current.lastClientX = moveEvent.clientX;
      mediaDragStateRef.current.lastClientY = moveEvent.clientY;
      mediaDragStateRef.current.lastTimestamp = moveEvent.timeStamp;
      const nextMotion = derivePhysicalMotion(deltaX, deltaY);
      setMediaMotionState(mediaItem.id, nextMotion);

      updateMediaItem(mediaItem.id, (currentItem) => ({
        ...currentItem,
        offsetX: mediaDragStateRef.current!.baseOffsetX + deltaX,
        offsetY: mediaDragStateRef.current!.baseOffsetY + deltaY,
      }));
    };

    const clearDrag = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      mediaDragStateRef.current = null;
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (
        !mediaDragStateRef.current ||
        mediaDragStateRef.current.mediaItemID !== mediaItem.id ||
        upEvent.pointerId !== mediaDragStateRef.current.pointerId
      ) {
        return;
      }

      const settleMotion = deriveSettleMotion(mediaMotionsRef.current[mediaItem.id] || ZERO_PHYSICAL_MOTION, {
        x: mediaDragStateRef.current.velocityX,
        y: mediaDragStateRef.current.velocityY,
      });
      snapMediaItemPosition(mediaItem.id, mediaElement);
      setDraggingMediaID(null);
      queueTransientState(
        () => {
          setMediaMotionState(mediaItem.id, settleMotion);
          setSettlingMediaIDs((previous) => [...previous.filter((item) => item !== mediaItem.id), mediaItem.id]);
        },
        () => {
          setMediaMotionState(mediaItem.id, ZERO_PHYSICAL_MOTION);
          setSettlingMediaIDs((previous) => previous.filter((item) => item !== mediaItem.id));
        },
      );
      clearDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const updatePaperNote = (noteID: string, updater: (note: WhitepaperNote) => WhitepaperNote) => {
    onUpdatePaperNote?.(noteID, updater);
  };

  const snapPaperNotePosition = (noteID: string, noteElement?: HTMLElement | null) => {
    const noteBoard = noteBoardRef.current;
    if (!noteBoard) return;

    const noteWidth = noteElement?.offsetWidth ?? 173;
    const noteHeight = noteElement?.offsetHeight ?? 188;
    const maxX = Math.max(0, noteBoard.clientWidth - noteWidth - 8);
    const maxY = Math.max(0, noteBoard.clientHeight - noteHeight - 8);
    const noteColumns = [0, Math.round(maxX / 2), maxX].filter((value, index, values) => values.indexOf(value) === index);

    updatePaperNote(noteID, (currentNote) => {
      let nextX = clamp(currentNote.offsetX, 0, maxX);
      let nextY = clamp(currentNote.offsetY, 0, maxY);

      nextX = snapToClosestPoint(nextX, noteColumns, NOTE_COLUMN_SNAP_THRESHOLD);
      nextY = snapToClosestPoint(nextY, [0, maxY], NOTE_EDGE_SNAP_THRESHOLD);

      if (nextX <= NOTE_EDGE_SNAP_THRESHOLD) nextX = 0;
      if (maxX - nextX <= NOTE_EDGE_SNAP_THRESHOLD) nextX = maxX;
      if (nextY <= NOTE_EDGE_SNAP_THRESHOLD) nextY = 0;
      if (maxY - nextY <= NOTE_EDGE_SNAP_THRESHOLD) nextY = maxY;
      const resolved = resolveBoardCollisions(
        {
          id: noteID,
          offsetX: nextX,
          offsetY: nextY,
          width: noteWidth,
          height: noteHeight,
        },
        paperNotes
          .filter((item) => item.id !== noteID)
          .map((item) => ({
            id: item.id,
            offsetX: item.offsetX,
            offsetY: item.offsetY,
            width: noteWidth,
            height: noteHeight,
          })),
        maxX,
        maxY,
      );
      nextX = resolved.offsetX;
      nextY = resolved.offsetY;
      const matchedAnchor =
        nextX === 0 && nextY === 0
          ? 'top-left'
          : nextX === maxX && nextY === 0
            ? 'top-right'
            : nextX === 0 && nextY === maxY
              ? 'bottom-left'
              : nextX === maxX && nextY === maxY
                ? 'bottom-right'
                : null;

      return {
        ...currentNote,
        offsetX: Math.round(nextX),
        offsetY: Math.round(nextY),
        rotation: matchedAnchor ? NOTE_ANCHOR_ROTATIONS[matchedAnchor] : currentNote.rotation,
      };
    });
  };

  const placePaperNoteAtAnchor = (noteID: string, anchor: PaperAnchor, noteElement?: HTMLElement | null) => {
    const noteBoard = noteBoardRef.current;
    if (!noteBoard) return;

    const fallbackNode = noteBoard.querySelector<HTMLElement>(`[data-note-id="${noteID}"]`);
    const activeNode = noteElement || fallbackNode;
    const noteWidth = activeNode?.offsetWidth ?? 173;
    const noteHeight = activeNode?.offsetHeight ?? 188;
    const maxX = Math.max(0, noteBoard.clientWidth - noteWidth - 8);
    const maxY = Math.max(0, noteBoard.clientHeight - noteHeight - 8);

    const nextOffsets =
      anchor === 'top-left'
        ? { offsetX: 0, offsetY: 0 }
        : anchor === 'top-right'
          ? { offsetX: maxX, offsetY: 0 }
          : anchor === 'bottom-left'
            ? { offsetX: 0, offsetY: maxY }
            : { offsetX: maxX, offsetY: maxY };

    updatePaperNote(noteID, (currentNote) => ({
      ...currentNote,
      ...nextOffsets,
      rotation: NOTE_ANCHOR_ROTATIONS[anchor],
    }));
  };

  const handleNotePointerDown = (note: WhitepaperNote, event: ReactPointerEvent<HTMLElement>) => {
    if (!editable) return;
    setDraggingNoteID(note.id);
    setSettlingNoteIDs((previous) => previous.filter((item) => item !== note.id));
    setNoteMotionState(note.id, ZERO_PHYSICAL_MOTION);
    const noteElement = event.currentTarget.closest('[data-note-id]') as HTMLElement | null;

    noteDragStateRef.current = {
      pointerId: event.pointerId,
      noteID: note.id,
      startX: event.clientX,
      startY: event.clientY,
      baseOffsetX: note.offsetX,
      baseOffsetY: note.offsetY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastTimestamp: event.timeStamp,
      velocityX: 0,
      velocityY: 0,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (
        !noteDragStateRef.current ||
        noteDragStateRef.current.noteID !== note.id ||
        moveEvent.pointerId !== noteDragStateRef.current.pointerId
      ) {
        return;
      }

      const deltaX = moveEvent.clientX - noteDragStateRef.current.startX;
      const deltaY = moveEvent.clientY - noteDragStateRef.current.startY;
      const elapsed = Math.max(moveEvent.timeStamp - noteDragStateRef.current.lastTimestamp, 1);
      noteDragStateRef.current.velocityX = (moveEvent.clientX - noteDragStateRef.current.lastClientX) / elapsed;
      noteDragStateRef.current.velocityY = (moveEvent.clientY - noteDragStateRef.current.lastClientY) / elapsed;
      noteDragStateRef.current.lastClientX = moveEvent.clientX;
      noteDragStateRef.current.lastClientY = moveEvent.clientY;
      noteDragStateRef.current.lastTimestamp = moveEvent.timeStamp;
      const nextMotion = derivePhysicalMotion(deltaX, deltaY);
      setNoteMotionState(note.id, nextMotion);

      updatePaperNote(note.id, (currentNote) => ({
        ...currentNote,
        offsetX: noteDragStateRef.current!.baseOffsetX + deltaX,
        offsetY: noteDragStateRef.current!.baseOffsetY + deltaY,
      }));
    };

    const clearDrag = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      noteDragStateRef.current = null;
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (
        !noteDragStateRef.current ||
        noteDragStateRef.current.noteID !== note.id ||
        upEvent.pointerId !== noteDragStateRef.current.pointerId
      ) {
        return;
      }

      const settleMotion = deriveSettleMotion(noteMotionsRef.current[note.id] || ZERO_PHYSICAL_MOTION, {
        x: noteDragStateRef.current.velocityX,
        y: noteDragStateRef.current.velocityY,
      });
      snapPaperNotePosition(note.id, noteElement);
      setDraggingNoteID(null);
      queueTransientState(
        () => {
          setNoteMotionState(note.id, settleMotion);
          setSettlingNoteIDs((previous) => [...previous.filter((item) => item !== note.id), note.id]);
        },
        () => {
          setNoteMotionState(note.id, ZERO_PHYSICAL_MOTION);
          setSettlingNoteIDs((previous) => previous.filter((item) => item !== note.id));
        },
      );
      clearDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const handleModulePointerDown = (moduleKey: PaperModuleKey, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!editable) return;

    const currentTransform = getModuleTransform(moduleKey);
    setDraggingModuleKey(moduleKey);
    setSettlingModuleKeys((previous) => previous.filter((item) => item !== moduleKey));
    setModuleMotionState(moduleKey, ZERO_PHYSICAL_MOTION);
    setModuleGuides({
      vertical: null,
      horizontal: null,
    });

    moduleDragStateRef.current = {
      pointerId: event.pointerId,
      moduleKey,
      startX: event.clientX,
      startY: event.clientY,
      baseOffsetX: currentTransform.offsetX,
      baseOffsetY: currentTransform.offsetY,
      lastClientX: event.clientX,
      lastClientY: event.clientY,
      lastTimestamp: event.timeStamp,
      velocityX: 0,
      velocityY: 0,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (
        !moduleDragStateRef.current ||
        moduleDragStateRef.current.moduleKey !== moduleKey ||
        moveEvent.pointerId !== moduleDragStateRef.current.pointerId
      ) {
        return;
      }

      const deltaX = moveEvent.clientX - moduleDragStateRef.current.startX;
      const deltaY = moveEvent.clientY - moduleDragStateRef.current.startY;
      const elapsed = Math.max(moveEvent.timeStamp - moduleDragStateRef.current.lastTimestamp, 1);
      moduleDragStateRef.current.velocityX = (moveEvent.clientX - moduleDragStateRef.current.lastClientX) / elapsed;
      moduleDragStateRef.current.velocityY = (moveEvent.clientY - moduleDragStateRef.current.lastClientY) / elapsed;
      moduleDragStateRef.current.lastClientX = moveEvent.clientX;
      moduleDragStateRef.current.lastClientY = moveEvent.clientY;
      moduleDragStateRef.current.lastTimestamp = moveEvent.timeStamp;

      setModuleMotionState(moduleKey, derivePhysicalMotion(deltaX, deltaY));
      const preview = previewModulePosition(
        moduleKey,
        clamp(moduleDragStateRef.current!.baseOffsetX + deltaX, -220, 220),
        clamp(moduleDragStateRef.current!.baseOffsetY + deltaY, -180, 220),
      );

      if (!preview) return;

      setModuleGuides(preview.guides);
      updateModuleTransform(moduleKey, (currentItem) => ({
        ...currentItem,
        offsetX: preview.offsetX,
        offsetY: preview.offsetY,
      }));
    };

    const clearDrag = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      moduleDragStateRef.current = null;
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (
        !moduleDragStateRef.current ||
        moduleDragStateRef.current.moduleKey !== moduleKey ||
        upEvent.pointerId !== moduleDragStateRef.current.pointerId
      ) {
        return;
      }

      const settleMotion = deriveSettleMotion(moduleMotionsRef.current[moduleKey] || ZERO_PHYSICAL_MOTION, {
        x: moduleDragStateRef.current.velocityX,
        y: moduleDragStateRef.current.velocityY,
      });
      snapModulePosition(moduleKey);
      setModuleGuides({
        vertical: null,
        horizontal: null,
      });
      setDraggingModuleKey(null);
      queueTransientState(
        () => {
          setModuleMotionState(moduleKey, settleMotion);
          setSettlingModuleKeys((previous) => [...previous.filter((item) => item !== moduleKey), moduleKey]);
        },
        () => {
          setModuleMotionState(moduleKey, ZERO_PHYSICAL_MOTION);
          setSettlingModuleKeys((previous) => previous.filter((item) => item !== moduleKey));
        },
      );
      clearDrag();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const headlineValue = editable ? aiGeneratedData.headline : aiGeneratedData.headline || event.title || tr('无题白纸', 'Untitled Whitepaper');
  const handwrittenBody = editable
    ? aiGeneratedData.handwrittenBody
    : aiGeneratedData.handwrittenBody.filter((paragraph) => paragraph.trim());
  const factCards = editable
    ? aiGeneratedData.factCards
    : aiGeneratedData.factCards.filter((card) => card.value.trim());
  const timeline = editable
    ? aiGeneratedData.timeline
    : aiGeneratedData.timeline.filter((item) => item.dateString.trim() || item.description.trim());
  const observations = editable
    ? aiGeneratedData.observations
    : aiGeneratedData.observations.filter((item) => item.trim());
  const selectedLayoutMode = layoutMode || 'minimal';
  const activeLayout = resolvePaperLayout(selectedLayoutMode, aiGeneratedData.layoutRecommendation);
  const showMetaAside =
    editable ||
    ((activeLayout === 'evidence' || activeLayout === 'timeline' || activeLayout === 'scrapbook') &&
      (factCards.length > 0 || timeline.length > 0));
  const showConclusion = editable || observations.length > 0 || aiGeneratedData.closing.trim();
  const referenceRotation = referenceImage?.rotation ?? -4;
  const referenceOffsetX = referenceImage?.offsetX ?? 0;
  const referenceOffsetY = referenceImage?.offsetY ?? 0;
  const referenceScale = referenceImage?.scale ?? 1;
  const referenceLayer = referenceImage?.layer ?? 'front';
  const mediaItems = editable
    ? event.mediaItems || []
    : (event.mediaItems || []).filter((item) => item.src.trim());
  const shouldShowReferenceModule =
    Boolean(referenceImage?.src) || (editable && (activeLayout === 'evidence' || activeLayout === 'scrapbook'));
  const shouldShowReferenceCaption =
    editable || activeLayout === 'evidence' || activeLayout === 'scrapbook' || Boolean((aiGeneratedData.imageInsight || '').trim());
  const shouldShowMediaSection =
    mediaItems.length > 0 || (editable && (activeLayout === 'evidence' || activeLayout === 'scrapbook' || isRecordingAudio));
  const mediaBoardRows = Math.max(1, Math.ceil(Math.max(mediaItems.length, 1) / 2));
  const mediaBoardMinHeight = 56 + mediaBoardRows * 236;
  const paperNotes = editable
    ? event.paperNotes || []
    : (event.paperNotes || []).filter((note) => note.text.trim());
  const noteBoardRows = Math.max(1, Math.ceil(Math.max(paperNotes.length, 1) / 2));
  const noteBoardMinHeight = 48 + noteBoardRows * 188;
  const isAnyPhysicalDragging = isReferenceDragging || draggingMediaID !== null || draggingNoteID !== null || draggingModuleKey !== null;
  const spreadMediaItems = () => {
    const mediaBoard = mediaBoardRef.current;
    if (!mediaBoard || mediaItems.length === 0) return;

    const sampleNode = mediaBoard.querySelector<HTMLElement>('[data-media-id]');
    const cardWidth = sampleNode?.offsetWidth ?? 216;
    const cardHeight = sampleNode?.offsetHeight ?? 286;
    const maxX = Math.max(0, mediaBoard.clientWidth - cardWidth - 8);
    const maxY = Math.max(0, mediaBoard.clientHeight - cardHeight - 8);
    const centerX = Math.round(maxX / 2);
    const centerY = Math.round(maxY / 2);
    const spreadPositions =
      maxY < 80
        ? [
            { offsetX: 0, offsetY: 0, rotation: -5 },
            { offsetX: centerX, offsetY: 12, rotation: 2 },
            { offsetX: maxX, offsetY: 0, rotation: 6 },
            { offsetX: Math.round(maxX * 0.24), offsetY: 28, rotation: -3 },
            { offsetX: Math.round(maxX * 0.74), offsetY: 28, rotation: 4 },
          ]
        : [
            { offsetX: 0, offsetY: 0, rotation: -5 },
            { offsetX: maxX, offsetY: 0, rotation: 6 },
            { offsetX: 0, offsetY: maxY, rotation: -2 },
            { offsetX: maxX, offsetY: maxY, rotation: 5 },
            { offsetX: centerX, offsetY: 0, rotation: -1 },
            { offsetX: centerX, offsetY: maxY, rotation: 2 },
            { offsetX: centerX, offsetY: centerY, rotation: 1 },
          ];

    mediaItems.forEach((mediaItem, index) => {
      const preset = spreadPositions[index % spreadPositions.length];
      updateMediaItem(mediaItem.id, (currentItem) => ({
        ...currentItem,
        ...preset,
        layer: 'front',
      }));
    });
  };
  const spreadPaperNotes = () => {
    const noteBoard = noteBoardRef.current;
    if (!noteBoard || paperNotes.length === 0) return;

    const sampleNode = noteBoard.querySelector<HTMLElement>('[data-note-id]');
    const noteWidth = sampleNode?.offsetWidth ?? 173;
    const noteHeight = sampleNode?.offsetHeight ?? 188;
    const maxX = Math.max(0, noteBoard.clientWidth - noteWidth - 8);
    const maxY = Math.max(0, noteBoard.clientHeight - noteHeight - 8);
    const centerX = Math.round(maxX / 2);
    const centerY = Math.round(maxY / 2);
    const spreadPositions =
      maxY < 80
        ? [
            { offsetX: 0, offsetY: 0, rotation: -6 },
            { offsetX: centerX, offsetY: 12, rotation: 1 },
            { offsetX: maxX, offsetY: 0, rotation: 6 },
            { offsetX: Math.round(maxX * 0.22), offsetY: 28, rotation: -3 },
            { offsetX: Math.round(maxX * 0.78), offsetY: 28, rotation: 4 },
            { offsetX: Math.round(maxX * 0.5), offsetY: 30, rotation: 2 },
          ]
        : [
            { offsetX: 0, offsetY: 0, rotation: -6 },
            { offsetX: maxX, offsetY: 0, rotation: 6 },
            { offsetX: 0, offsetY: maxY, rotation: -2 },
            { offsetX: maxX, offsetY: maxY, rotation: 5 },
            { offsetX: centerX, offsetY: 0, rotation: -1 },
            { offsetX: centerX, offsetY: maxY, rotation: 2 },
            { offsetX: 0, offsetY: centerY, rotation: -4 },
            { offsetX: maxX, offsetY: centerY, rotation: 4 },
            { offsetX: centerX, offsetY: centerY, rotation: 1 },
          ];

    paperNotes.forEach((note, index) => {
      const preset = spreadPositions[index % spreadPositions.length];
      updatePaperNote(note.id, (currentNote) => ({
        ...currentNote,
        ...preset,
        layer: 'front',
      }));
    });
  };

  const getModuleBoardState = (moduleKey: PaperModuleKey) => {
    const resultShell = resultShellRef.current;
    const moduleNode = moduleRefs.current[moduleKey];

    if (!resultShell || !moduleNode) return null;

    const resultRect = resultShell.getBoundingClientRect();
    const moduleRect = moduleNode.getBoundingClientRect();
    const currentTransform = getModuleTransform(moduleKey);
    const naturalRelativeX = moduleRect.left - resultRect.left - currentTransform.offsetX;
    const naturalRelativeY = moduleRect.top - resultRect.top - currentTransform.offsetY;
    const maxX = Math.max(0, resultShell.clientWidth - moduleRect.width);
    const maxY = Math.max(0, resultShell.scrollHeight - moduleRect.height);
    const shellWidth = maxX + moduleRect.width;
    const shellHeight = maxY + moduleRect.height;
    const siblingRects: BoardRect[] = MODULE_KEYS.filter((key) => key !== moduleKey).reduce<BoardRect[]>((items, key) => {
      const node = moduleRefs.current[key];
      if (!node) return items;

      const rect = node.getBoundingClientRect();
      items.push({
        id: key,
        offsetX: rect.left - resultRect.left,
        offsetY: rect.top - resultRect.top,
        width: rect.width,
        height: rect.height,
      });
      return items;
    }, []);

    return {
      moduleRect,
      naturalRelativeX,
      naturalRelativeY,
      maxX,
      maxY,
      shellWidth,
      shellHeight,
      siblingRects,
    };
  };

  const previewModulePosition = (moduleKey: PaperModuleKey, rawOffsetX: number, rawOffsetY: number) => {
    const boardState = getModuleBoardState(moduleKey);
    if (!boardState) return null;

    const rawRelativeX = boardState.naturalRelativeX + rawOffsetX;
    const rawRelativeY = boardState.naturalRelativeY + rawOffsetY;
    const xCandidates: SnapCandidate[] = [
      { offset: 0, guide: 0 },
      { offset: boardState.maxX / 2, guide: boardState.shellWidth / 2 },
      { offset: boardState.maxX, guide: boardState.shellWidth },
      ...boardState.siblingRects.flatMap((rect) => [
        { offset: rect.offsetX, guide: rect.offsetX },
        { offset: rect.offsetX + rect.width / 2 - boardState.moduleRect.width / 2, guide: rect.offsetX + rect.width / 2 },
        { offset: rect.offsetX + rect.width - boardState.moduleRect.width, guide: rect.offsetX + rect.width },
      ]),
    ];
    const yCandidates: SnapCandidate[] = [
      { offset: 0, guide: 0 },
      { offset: boardState.maxY / 2, guide: boardState.shellHeight / 2 },
      { offset: boardState.maxY, guide: boardState.shellHeight },
      ...boardState.siblingRects.flatMap((rect) => [
        { offset: rect.offsetY, guide: rect.offsetY },
        { offset: rect.offsetY + rect.height / 2 - boardState.moduleRect.height / 2, guide: rect.offsetY + rect.height / 2 },
        { offset: rect.offsetY + rect.height - boardState.moduleRect.height, guide: rect.offsetY + rect.height },
      ]),
    ];
    const snappedX = resolveSnapCandidate(rawRelativeX, xCandidates, 22, boardState.maxX);
    const snappedY = resolveSnapCandidate(rawRelativeY, yCandidates, 20, boardState.maxY);
    const resolved = resolveBoardCollisions(
      {
        id: moduleKey,
        offsetX: snappedX.offset,
        offsetY: snappedY.offset,
        width: boardState.moduleRect.width,
        height: boardState.moduleRect.height,
      },
      boardState.siblingRects,
      boardState.maxX,
      boardState.maxY,
    );

    return {
      offsetX: Math.round(resolved.offsetX - boardState.naturalRelativeX),
      offsetY: Math.round(resolved.offsetY - boardState.naturalRelativeY),
      guides: {
        vertical: Math.abs(resolved.offsetX - snappedX.offset) <= 10 ? snappedX.guide : null,
        horizontal: Math.abs(resolved.offsetY - snappedY.offset) <= 10 ? snappedY.guide : null,
      },
    };
  };

  const snapModulePosition = (moduleKey: PaperModuleKey) => {
    const currentTransform = getModuleTransform(moduleKey);
    const preview = previewModulePosition(moduleKey, currentTransform.offsetX, currentTransform.offsetY);
    if (!preview) return;

    setModuleGuides(preview.guides);
    if (preview.guides.vertical !== null || preview.guides.horizontal !== null) {
      const timer = window.setTimeout(() => {
        setModuleGuides({
          vertical: null,
          horizontal: null,
        });
        settleTimersRef.current = settleTimersRef.current.filter((item) => item !== timer);
      }, 260);
      settleTimersRef.current.push(timer);
    }
    updateModuleTransform(moduleKey, (transform) => ({
      ...transform,
      offsetX: preview.offsetX,
      offsetY: preview.offsetY,
    }));
  };

  const renderModuleShell = (moduleKey: PaperModuleKey, content: ReactNode, className = '') => {
    const moduleTransform = getModuleTransform(moduleKey);
    const moduleMotion = moduleMotions[moduleKey] || ZERO_PHYSICAL_MOTION;
    const moduleLayer = moduleTransform.layer === 'back' ? 'back' : 'front';

    return (
      <div
        ref={(node) => {
          moduleRefs.current[moduleKey] = node;
        }}
        data-module-key={moduleKey}
        className={`whitepaper-module-shell ${moduleLayer === 'back' ? 'whitepaper-module-shell--back' : 'whitepaper-module-shell--front'} ${draggingModuleKey === moduleKey ? 'is-dragging' : ''} ${settlingModuleKeys.includes(moduleKey) ? 'is-settling' : ''} ${className}`}
        style={{
          transform: buildPhysicalTransform(moduleTransform.offsetX, moduleTransform.offsetY, moduleTransform.rotation, 1, moduleMotion),
          zIndex: moduleLayer === 'back' ? 1 : 8,
        }}
      >
        {editable && (
          <div className="whitepaper-module-shell__controls">
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                handleModulePointerDown(moduleKey, event);
              }}
              className="whitepaper-module-shell__chip"
            >
              <Move size={12} />
              {tr('拖动模块', 'Drag Block')}
            </button>
            <button
              type="button"
              onClick={() =>
                updateModuleTransform(moduleKey, (currentTransform) => ({
                  ...currentTransform,
                  rotation: currentTransform.rotation - 3,
                }))
              }
              className="whitepaper-module-shell__chip"
            >
              <RotateCcw size={12} />
              {tr('左转', 'Left')}
            </button>
            <button
              type="button"
              onClick={() =>
                updateModuleTransform(moduleKey, (currentTransform) => ({
                  ...currentTransform,
                  rotation: currentTransform.rotation + 3,
                }))
              }
              className="whitepaper-module-shell__chip"
            >
              <RotateCw size={12} />
              {tr('右转', 'Right')}
            </button>
            <button
              type="button"
              onClick={() => snapModulePosition(moduleKey)}
              className="whitepaper-module-shell__chip"
            >
              <Move size={12} />
              {tr('吸附', 'Snap')}
            </button>
            <button
              type="button"
              onClick={() =>
                updateModuleTransform(moduleKey, (currentTransform) => ({
                  ...currentTransform,
                  layer: 'front',
                }))
              }
              className="whitepaper-module-shell__chip"
            >
              {tr('置前', 'Front')}
            </button>
            <button
              type="button"
              onClick={() =>
                updateModuleTransform(moduleKey, (currentTransform) => ({
                  ...currentTransform,
                  layer: 'back',
                }))
              }
              className="whitepaper-module-shell__chip"
            >
              {tr('置后', 'Back')}
            </button>
            <button
              type="button"
              onClick={() =>
                updateModuleTransform(moduleKey, () => ({
                  offsetX: 0,
                  offsetY: 0,
                  rotation: 0,
                  layer: 'front',
                }))
              }
              className="whitepaper-module-shell__chip"
            >
              {tr('归位', 'Reset')}
            </button>
          </div>
        )}

        <div className="whitepaper-module-shell__inner">{content}</div>
      </div>
    );
  };

  return (
    <section
      key={unlockVersion}
      className={`relative mt-4 pb-12 ${isUnlocking ? 'whitepaper-unlocking' : ''}`}
    >
      <div className="whitepaper-unlock-mask" aria-hidden="true" />

      <div ref={resultShellRef} className={`relative z-10 flex flex-col gap-10 whitepaper-result-shell whitepaper-layout-shell whitepaper-layout--${activeLayout}`}>
        {moduleGuides.vertical !== null && (
          <div className="whitepaper-module-guide whitepaper-module-guide--vertical" style={{ left: `${moduleGuides.vertical}px` }} />
        )}
        {moduleGuides.horizontal !== null && (
          <div className="whitepaper-module-guide whitepaper-module-guide--horizontal" style={{ top: `${moduleGuides.horizontal}px` }} />
        )}
        <header className="border-b border-black/10 pb-6">
          <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.35em] text-black/45">
            <span className="inline-flex items-center gap-2">
              <Sparkles size={14} />
              {tr('白纸', 'White Paper')}
            </span>
            <span>{formatDisplayDate(event.updatedAt, locale)}</span>
            {editable && <span className="rounded-full border border-black/10 px-3 py-1 text-[10px] tracking-[0.25em]">{tr('可修改', 'Editable')}</span>}
          </div>

          <EditableText
            editable={editable}
            value={headlineValue}
            rows={2}
            onChange={(value) => updateField('headline', value)}
            placeholder={tr('写下这张白纸的标题', 'Write the title of this sheet')}
            className="mt-6 whitepaper-handwriting text-[3rem] leading-none text-neutral-900 md:text-[4.5rem]"
            editingClassName="mt-6 w-full resize-none overflow-hidden rounded-[28px] border border-black/10 bg-white/55 px-4 py-3 whitepaper-handwriting text-[3rem] leading-none text-neutral-900 outline-none transition placeholder:text-black/20 focus:border-black/20 focus:bg-white/78 md:text-[4.5rem]"
            style={scaleFont('clamp(3rem, 7vw, 4.5rem)')}
            editingStyle={scaleFont('clamp(3rem, 7vw, 4.5rem)')}
          />
          <EditableText
            editable={editable}
            value={aiGeneratedData.subtitle}
            rows={2}
            onChange={(value) => updateField('subtitle', value)}
            placeholder={tr('补一句副题，让这张白纸有个气口', 'Add a subtitle to give the sheet its tone')}
            className="mt-4 max-w-3xl text-lg leading-8 text-neutral-700 md:text-xl"
            editingClassName="mt-4 w-full max-w-3xl resize-none overflow-hidden rounded-2xl border border-black/8 bg-white/55 px-4 py-3 text-lg leading-8 text-neutral-700 outline-none transition placeholder:text-black/20 focus:border-black/20 focus:bg-white/78 md:text-xl"
            style={scaleFont('clamp(1.08rem, 2vw, 1.25rem)')}
            editingStyle={scaleFont('clamp(1.08rem, 2vw, 1.25rem)')}
          />

          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-xs leading-6 text-black/42">
              {selectedLayoutMode === 'ai'
                ? tr(`当前按 AI 推荐布局呈现，推荐结果是「${getLayoutLabel(activeLayout)}」。`, `Currently using the AI layout recommendation: "${getLayoutLabel(activeLayout)}".`)
                : tr(`当前使用「${getLayoutLabel(activeLayout)}」。`, `Currently using "${getLayoutLabel(activeLayout)}".`)}
            </div>
            {editable ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex items-center gap-1 rounded-full border border-black/10 bg-white/72 px-2 py-1">
                  <button
                    type="button"
                    onClick={() => shiftFontScale(-0.08)}
                    className="rounded-full px-2 py-1 text-[11px] font-semibold text-neutral-700 transition hover:bg-black/5"
                    title={tr('缩小字体', 'Decrease font size')}
                  >
                    A-
                  </button>
                  <span className="min-w-[3.25rem] text-center text-[11px] text-black/52">{Math.round(fontScale * 100)}%</span>
                  <button
                    type="button"
                    onClick={() => onFontScaleChange?.(1)}
                    className="rounded-full px-2 py-1 text-[11px] font-semibold text-neutral-700 transition hover:bg-black/5"
                    title={tr('恢复默认字号', 'Reset font size')}
                  >
                    A
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftFontScale(0.08)}
                    className="rounded-full px-2 py-1 text-[11px] font-semibold text-neutral-700 transition hover:bg-black/5"
                    title={tr('放大字体', 'Increase font size')}
                  >
                    A+
                  </button>
                </div>
                <div className="whitepaper-layout-switcher">
                  {PAPER_LAYOUT_BUTTONS.map((mode) => {
                    const isActive = selectedLayoutMode === mode;

                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onLayoutModeChange?.(mode)}
                        className={`whitepaper-layout-switcher__button ${isActive ? 'is-active' : ''}`}
                      >
                        {getLayoutLabel(mode)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="rounded-full border border-black/10 bg-white/72 px-3 py-1 text-[11px] text-black/52">
                  {tr(`字号 ${Math.round(fontScale * 100)}%`, `Text ${Math.round(fontScale * 100)}%`)}
                </div>
                <div className="whitepaper-layout-switcher">
                  <span className="whitepaper-layout-switcher__button is-active">{getLayoutLabel(activeLayout)}</span>
                </div>
              </div>
            )}
          </div>
        </header>

        <section className={`whitepaper-layout-main ${showMetaAside ? 'has-aside' : 'is-single-column'}`}>
          <div className="whitepaper-layout-column whitepaper-layout-column--body">
            {renderModuleShell(
              'lead',
              <div className="whitepaper-layout-module whitepaper-layout-module--lead">
                <EditableText
                  editable={editable}
                  value={aiGeneratedData.lead}
                  rows={3}
                  onChange={(value) => updateField('lead', value)}
                  placeholder={tr('先写一个引子，让读的人知道这张纸从哪里开始', 'Write an opening so the reader knows where this sheet begins')}
                  className="whitepaper-handwriting text-[1.8rem] leading-[1.55] text-neutral-900 md:text-[2.3rem]"
                  editingClassName="w-full resize-none overflow-hidden rounded-[26px] border border-black/8 bg-white/55 px-4 py-3 whitepaper-handwriting text-[1.8rem] leading-[1.55] text-neutral-900 outline-none transition placeholder:text-black/20 focus:border-black/20 focus:bg-white/78 md:text-[2.3rem]"
                  style={scaleFont('clamp(1.8rem, 3.4vw, 2.3rem)')}
                  editingStyle={scaleFont('clamp(1.8rem, 3.4vw, 2.3rem)')}
                />
              </div>,
            )}

            {renderModuleShell(
              'body',
              <div className="whitepaper-layout-module whitepaper-layout-module--body">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.28em] text-black/38">{tr('正文段落', 'Body')}</div>
                  {editable && (
                    <button
                      type="button"
                      onClick={addBodyParagraph}
                      className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                    >
                      <MessageSquarePlus size={14} />
                      {tr('添加段落', 'Add Paragraph')}
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-5">
                  {handwrittenBody.map((paragraph, index) => (
                    <div key={`${index}-${paragraph}`} className="flex flex-col gap-2">
                      <EditableText
                        editable={editable}
                        value={paragraph}
                        rows={3}
                        onChange={(value) => updateArrayItem('handwrittenBody', index, value)}
                        placeholder={tr(`正文第 ${index + 1} 段，像手写记事一样写下去`, `Body paragraph ${index + 1}, keep writing it like a handwritten note`)}
                        className="whitepaper-handwriting text-[1.45rem] leading-[1.7] text-black/85 md:text-[1.85rem]"
                        editingClassName="w-full resize-none overflow-hidden rounded-[24px] border border-black/8 bg-white/55 px-4 py-3 whitepaper-handwriting text-[1.45rem] leading-[1.7] text-black/85 outline-none transition placeholder:text-black/20 focus:border-black/20 focus:bg-white/78 md:text-[1.85rem]"
                        style={scaleFont('clamp(1.45rem, 2.8vw, 1.85rem)')}
                        editingStyle={scaleFont('clamp(1.45rem, 2.8vw, 1.85rem)')}
                      />
                      {editable && handwrittenBody.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeBodyParagraph(index)}
                          className="inline-flex w-fit items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                        >
                          <Trash2 size={14} />
                          {tr('删除这一段', 'Delete Paragraph')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>,
            )}

            {shouldShowReferenceModule && (
              <figure
                className={`whitepaper-layout-module whitepaper-layout-module--reference whitepaper-reference-figure ${activeLayout === 'evidence' || activeLayout === 'scrapbook' ? 'max-w-[25rem]' : 'max-w-[17rem]'} self-start md:ml-6 ${referenceLayer === 'back' ? 'whitepaper-reference-figure--back' : 'whitepaper-reference-figure--front'} ${isReferenceDragging ? 'is-dragging' : ''} ${isReferenceSettling ? 'is-settling' : ''}`}
                style={{
                  transform: buildPhysicalTransform(
                    referenceOffsetX,
                    referenceOffsetY,
                    referenceRotation,
                    referenceScale,
                    referenceMotion,
                  ),
                  transformOrigin: 'center top',
                  zIndex: referenceLayer === 'back' ? 0 : 16,
                  boxShadow: buildPaperShadow(referenceRotation, referenceLayer, 'figure'),
                }}
              >
                {referenceImage?.src ? (
                  <div
                    className={`whitepaper-reference-card relative aspect-[4/5] overflow-hidden rounded-[26px] border border-black/10 bg-[#eadfca] shadow-[0_22px_50px_-28px_rgba(0,0,0,0.42)] ${editable ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    onPointerDown={handleReferencePointerDown}
                    style={{
                      boxShadow: buildSurfaceShadow(referenceRotation, referenceLayer),
                    }}
                  >
                    <Image
                      src={referenceImage.src}
                      alt={referenceImage.alt || aiGeneratedData.headline}
                      fill
                      unoptimized
                      sizes="(max-width: 768px) 70vw, 22rem"
                      className="object-cover"
                    />
                    {editable && (
                      <div className="pointer-events-none absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-[11px] tracking-[0.24em] text-white/90">
                        <Move size={12} />
                        {tr('拖动', 'Drag')}
                      </div>
                    )}
                  </div>
                ) : (
                  <label className="flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-3 rounded-[26px] border border-dashed border-black/15 bg-white/60 px-6 text-center transition hover:bg-white/78">
                    <input type="file" accept="image/*" className="hidden" onChange={handleReferenceImageChange} />
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-black text-white">
                      <ImagePlus size={22} />
                    </span>
                    <div className="text-sm font-medium text-neutral-700">{tr('给这张白纸补一张现场图', 'Add a scene image to this sheet')}</div>
                  </label>
                )}

                {shouldShowReferenceCaption && (
                  <figcaption className="mt-3 border-l-2 border-black/12 pl-3">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-black/36">{tr('贴图旁注', 'Pinned Note')}</div>
                  <EditableText
                    editable={editable}
                    value={
                      aiGeneratedData.imageInsight ||
                      tr(
                        '我把这张图贴在旁边，是怕后来连当时的光线和位置都记不清。',
                        'I pasted this beside the text because I did not want to lose the light and place of that moment.',
                      )
                    }
                    rows={3}
                    onChange={(value) => updateField('imageInsight', value)}
                    placeholder={tr('给这张贴图补一句手边旁注', 'Add one short handwritten note beside the image')}
                    className="mt-2 whitepaper-handwriting text-[1.02rem] leading-[1.55] text-black/74 md:text-[1.18rem]"
                    editingClassName="mt-2 w-full resize-none overflow-hidden rounded-2xl border border-black/8 bg-white/55 px-3 py-2 whitepaper-handwriting text-[1.02rem] leading-[1.55] text-black/74 outline-none transition placeholder:text-black/20 focus:border-black/20 focus:bg-white/78 md:text-[1.18rem]"
                    style={scaleFont('clamp(1.02rem, 2vw, 1.18rem)')}
                    editingStyle={scaleFont('clamp(1.02rem, 2vw, 1.18rem)')}
                  />

                  {editable && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {referenceImage?.src && (
                        <>
                          <button
                            type="button"
                            onClick={snapReferenceImagePosition}
                            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                          >
                            <Move size={14} />
                            {tr('吸附纸边', 'Snap to Edge')}
                          </button>
                          <button
                            type="button"
                            onClick={() => placeReferenceImageAtAnchor('top-left')}
                            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                          >
                            {tr('左上贴位', 'Top Left')}
                          </button>
                          <button
                            type="button"
                            onClick={() => placeReferenceImageAtAnchor('top-right')}
                            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                          >
                            {tr('右上贴位', 'Top Right')}
                          </button>
                          <button
                            type="button"
                            onClick={() => placeReferenceImageAtAnchor('bottom-left')}
                            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                          >
                            {tr('左下贴位', 'Bottom Left')}
                          </button>
                          <button
                            type="button"
                            onClick={() => placeReferenceImageAtAnchor('bottom-right')}
                            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                          >
                            {tr('右下贴位', 'Bottom Right')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateReferenceTransform((image) => ({
                                ...image,
                                layer: 'front',
                              }))
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                          >
                            {tr('提到字前', 'Bring Forward')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateReferenceTransform((image) => ({
                                ...image,
                                layer: 'back',
                              }))
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                          >
                            {tr('压到字后', 'Send Behind')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateReferenceTransform((image) => ({
                                ...image,
                                rotation: (image.rotation ?? -4) - 4,
                              }))
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                          >
                            <RotateCcw size={14} />
                            {tr('向左转', 'Rotate Left')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateReferenceTransform((image) => ({
                                ...image,
                                rotation: (image.rotation ?? -4) + 4,
                              }))
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                          >
                            <RotateCw size={14} />
                            {tr('向右转', 'Rotate Right')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateReferenceTransform((image) => ({
                                ...image,
                                scale: Math.max(0.82, Number(((image.scale ?? 1) - 0.08).toFixed(2))),
                              }))
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                          >
                            <ZoomOut size={14} />
                            {tr('缩小', 'Zoom Out')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateReferenceTransform((image) => ({
                                ...image,
                                scale: Math.min(1.28, Number(((image.scale ?? 1) + 0.08).toFixed(2))),
                              }))
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                          >
                            <ZoomIn size={14} />
                            {tr('放大', 'Zoom In')}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateReferenceTransform((image) => ({
                                ...image,
                                rotation: -4,
                                offsetX: 0,
                                offsetY: 0,
                                scale: 1,
                              }))
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                          >
                            <Move size={14} />
                            {tr('归位', 'Reset')}
                          </button>
                        </>
                      )}
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white">
                        <ImagePlus size={14} />
                        {referenceImage?.src ? tr('替换图片', 'Replace Image') : tr('添加图片', 'Add Image')}
                        <input type="file" accept="image/*" className="hidden" onChange={handleReferenceImageChange} />
                      </label>
                      {referenceImage?.src && (
                        <button
                          type="button"
                          onClick={onReferenceImageRemove}
                          className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                        >
                          <Trash2 size={14} />
                          {tr('移除图片', 'Remove Image')}
                        </button>
                      )}
                    </div>
                  )}
                  </figcaption>
                )}
              </figure>
            )}

            {shouldShowMediaSection && (
              <section className="whitepaper-layout-module whitepaper-layout-module--media border-t border-black/10 pt-8">
                <div className="mb-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-black/55">
                    <Volume2 size={16} />
                    {tr('纸上素材', 'Paper Assets')}
                  </div>
                  {editable && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={spreadMediaItems}
                        className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                      >
                        <Sparkles size={14} />
                        {tr('散开摆放', 'Spread Out')}
                      </button>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white">
                        <ImagePlus size={14} />
                        {tr('添加图片', 'Add Image')}
                        <input ref={mediaInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleMediaAddChange} />
                      </label>
                      <button
                        type="button"
                        onClick={onToggleAudioRecording}
                        className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                      >
                        {isRecordingAudio ? <RotateCcw size={14} /> : <Mic size={14} />}
                        {isRecordingAudio ? tr('结束录音', 'Stop Recording') : tr('录音贴入', 'Pin Audio')}
                      </button>
                    </div>
                  )}
                </div>

                <div
                  ref={mediaBoardRef}
                  className={`whitepaper-media-board relative rounded-[30px] border border-black/8 bg-[rgba(255,252,246,0.72)] px-4 py-5 ${isAnyPhysicalDragging ? 'is-reacting' : ''}`}
                  style={{
                    minHeight: `${mediaBoardMinHeight}px`,
                  }}
                >
                  {mediaItems.map((mediaItem) => {
                    const mediaLayer = mediaItem.layer === 'back' ? 'back' : 'front';
                    const mediaShadow = buildPaperShadow(mediaItem.rotation, mediaLayer, 'figure');
                    const mediaMotion = mediaMotions[mediaItem.id] || ZERO_PHYSICAL_MOTION;

                    return (
                      <article
                        key={mediaItem.id}
                        data-media-id={mediaItem.id}
                        className={`whitepaper-media absolute w-[13rem] ${mediaLayer === 'back' ? 'whitepaper-media--back' : 'whitepaper-media--front'} ${draggingMediaID === mediaItem.id ? 'is-dragging' : ''} ${settlingMediaIDs.includes(mediaItem.id) ? 'is-settling' : ''}`}
                        style={{
                          transform: buildPhysicalTransform(
                            mediaItem.offsetX,
                            mediaItem.offsetY,
                            mediaItem.rotation,
                            mediaItem.scale,
                            mediaMotion,
                          ),
                          zIndex: mediaLayer === 'back' ? 4 : 20,
                        }}
                      >
                        <div
                          className={`whitepaper-media__sheet rounded-[28px] px-4 py-4 ${mediaItem.kind === 'audio' ? 'whitepaper-media__sheet--audio' : ''}`}
                          style={{
                            boxShadow: mediaShadow,
                          }}
                        >
                          {editable && (
                            <button
                              type="button"
                              onPointerDown={(event) => {
                                event.preventDefault();
                                handleMediaPointerDown(mediaItem, event);
                              }}
                              className="mb-3 inline-flex cursor-grab select-none touch-none items-center gap-1 rounded-full bg-black/8 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-black/45 active:cursor-grabbing"
                            >
                              <Move size={10} />
                              {tr('拖动', 'Drag')}
                            </button>
                          )}

                          {mediaItem.kind === 'image' ? (
                            <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] border border-black/10 bg-[#eadfca]">
                              <Image
                                src={mediaItem.src}
                                alt={mediaItem.alt || mediaItem.caption || aiGeneratedData.headline}
                                fill
                                unoptimized
                                sizes="(max-width: 768px) 60vw, 16rem"
                                className="object-cover"
                              />
                            </div>
                          ) : (
                            <div className="rounded-[24px] border border-black/10 bg-white/82 px-4 py-4">
                              <div className="flex items-center gap-3">
                                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black text-white">
                                  <Volume2 size={18} />
                                </span>
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold text-neutral-800">{mediaItem.name || tr('现场录音', 'Scene Audio')}</div>
                                  <div className="text-xs text-neutral-500">{tr('可直接在白纸上播放', 'Playable directly on the paper')}</div>
                                </div>
                              </div>
                              <audio controls src={mediaItem.src} className="mt-4 w-full" preload="metadata" />
                            </div>
                          )}

                          <EditableText
                            editable={editable}
                            value={mediaItem.caption}
                            rows={3}
                            onChange={(value) =>
                              updateMediaItem(mediaItem.id, (currentItem) => ({
                                ...currentItem,
                                caption: value,
                              }))
                            }
                            placeholder={mediaItem.kind === 'image' ? tr('给这张图补一句旁注', 'Add a caption for this image') : tr('给这段声音补一句旁注', 'Add a caption for this audio')}
                            className="mt-4 whitepaper-handwriting text-[1.15rem] leading-[1.55] text-black/78"
                            editingClassName="mt-4 w-full resize-none overflow-hidden rounded-2xl border border-black/8 bg-white/60 px-3 py-2 whitepaper-handwriting text-[1.15rem] leading-[1.55] text-black/78 outline-none transition placeholder:text-black/25 focus:border-black/20 focus:bg-white/80"
                            style={scaleFont('1.15rem')}
                            editingStyle={scaleFont('1.15rem')}
                          />
                        </div>

                        {editable && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                updateMediaItem(mediaItem.id, (currentItem) => ({
                                  ...currentItem,
                                  rotation: currentItem.rotation - 4,
                                }))
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                            >
                              <RotateCcw size={12} />
                              {tr('左转', 'Left')}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateMediaItem(mediaItem.id, (currentItem) => ({
                                  ...currentItem,
                                  rotation: currentItem.rotation + 4,
                                }))
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                            >
                              <RotateCw size={12} />
                              {tr('右转', 'Right')}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateMediaItem(mediaItem.id, (currentItem) => ({
                                  ...currentItem,
                                  scale: Math.max(0.78, Number((currentItem.scale - 0.08).toFixed(2))),
                                }))
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                            >
                              <ZoomOut size={12} />
                              {tr('缩小', 'Zoom Out')}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateMediaItem(mediaItem.id, (currentItem) => ({
                                  ...currentItem,
                                  scale: Math.min(1.36, Number((currentItem.scale + 0.08).toFixed(2))),
                                }))
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                            >
                              <ZoomIn size={12} />
                              {tr('放大', 'Zoom In')}
                            </button>
                            <button
                              type="button"
                              onClick={() => snapMediaItemPosition(mediaItem.id)}
                              className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                            >
                              <Move size={12} />
                              {tr('贴边', 'Snap')}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => placeMediaItemAtAnchor(mediaItem.id, 'top-left', event.currentTarget.closest('[data-media-id]') as HTMLElement | null)}
                              className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                            >
                              {tr('左上', 'Top Left')}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => placeMediaItemAtAnchor(mediaItem.id, 'top-right', event.currentTarget.closest('[data-media-id]') as HTMLElement | null)}
                              className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                            >
                              {tr('右上', 'Top Right')}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => placeMediaItemAtAnchor(mediaItem.id, 'bottom-left', event.currentTarget.closest('[data-media-id]') as HTMLElement | null)}
                              className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                            >
                              {tr('左下', 'Bottom Left')}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => placeMediaItemAtAnchor(mediaItem.id, 'bottom-right', event.currentTarget.closest('[data-media-id]') as HTMLElement | null)}
                              className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                            >
                              {tr('右下', 'Bottom Right')}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateMediaItem(mediaItem.id, (currentItem) => ({
                                  ...currentItem,
                                  layer: 'front',
                                }))
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                            >
                              {tr('置顶', 'Bring Front')}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateMediaItem(mediaItem.id, (currentItem) => ({
                                  ...currentItem,
                                  layer: 'back',
                                }))
                              }
                              className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                            >
                              {tr('置底', 'Send Back')}
                            </button>
                            {mediaItem.kind === 'image' && (
                              <label className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white">
                                <ImagePlus size={12} />
                                {tr('替换', 'Replace')}
                                <input type="file" accept="image/*" className="hidden" onChange={(event) => handleMediaReplaceChange(mediaItem.id, event)} />
                              </label>
                            )}
                            <button
                              type="button"
                              onClick={() => onRemoveMediaItem?.(mediaItem.id)}
                              className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                            >
                              <Trash2 size={12} />
                              {tr('删除', 'Delete')}
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })}

                  {!editable && mediaItems.length === 0 && (
                    <div className="text-sm leading-6 text-black/30">{tr('这张白纸没有额外贴上的图片或录音。', 'There are no extra images or audio pinned to this sheet.')}</div>
                  )}
                </div>
              </section>
            )}
          </div>

          {showMetaAside && (
            <aside className="whitepaper-layout-column whitepaper-layout-column--meta">
              {(editable || factCards.length > 0) && (
                renderModuleShell('factCards', <div className="whitepaper-layout-module whitepaper-layout-module--fact-cards rounded-[28px] border border-black/8 bg-white/55 px-5 py-5 shadow-[0_20px_48px_-32px_rgba(0,0,0,0.38)]">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.28em] text-black/42">
                      {tr('事件侧记', 'Fact Cards')}
                    </div>
                    {editable && (
                      <button
                        type="button"
                        onClick={addFactCard}
                        className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                      >
                        <MessageSquarePlus size={14} />
                        {tr('添加卡片', 'Add Card')}
                      </button>
                    )}
                  </div>
                  {factCards.map((card, index) => (
                    <div
                      key={card.id}
                      className="border-b border-black/8 py-4 last:border-b-0 last:pb-0 first:pt-0"
                    >
                      <EditableText
                        editable={editable}
                        value={card.label}
                        rows={1}
                        onChange={(value) => updateFactCard(index, 'label', value)}
                        placeholder={tr('小标题', 'Label')}
                        className="text-[11px] uppercase tracking-[0.3em] text-black/35"
                        editingClassName="w-full resize-none overflow-hidden rounded-xl border border-black/8 bg-white/70 px-2 py-1 text-[11px] uppercase tracking-[0.3em] text-black/45 outline-none transition placeholder:text-black/20 focus:border-black/20"
                      />
                      <EditableText
                        editable={editable}
                        value={card.value}
                        rows={2}
                        onChange={(value) => updateFactCard(index, 'value', value)}
                        placeholder={tr('把这块白纸边角的信息写上去', 'Write the extra detail for this corner of the paper')}
                        className="mt-2 whitepaper-handwriting text-[1.2rem] leading-[1.45] text-black/80 md:text-[1.46rem]"
                        editingClassName="mt-2 w-full resize-none overflow-hidden rounded-2xl border border-black/8 bg-white/70 px-3 py-2 whitepaper-handwriting text-[1.2rem] leading-[1.45] text-black/80 outline-none transition placeholder:text-black/20 focus:border-black/20 md:text-[1.46rem]"
                        style={scaleFont('clamp(1.2rem, 2vw, 1.46rem)')}
                        editingStyle={scaleFont('clamp(1.2rem, 2vw, 1.46rem)')}
                      />
                      {editable && factCards.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeFactCard(index)}
                          className="mt-3 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                        >
                          <Trash2 size={14} />
                          {tr('删除卡片', 'Delete Card')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>)
              )}

              {(editable || timeline.length > 0) && (
                renderModuleShell('timeline', <div className="whitepaper-layout-module whitepaper-layout-module--timeline rounded-[28px] border border-black/8 bg-white/55 px-5 py-5 shadow-[0_20px_48px_-32px_rgba(0,0,0,0.38)]">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.2em] text-black/55 uppercase">
                      <CalendarDays size={16} />
                      {tr('事件脉络', 'Timeline')}
                    </div>
                    {editable && (
                      <button
                        type="button"
                        onClick={addTimelineItem}
                        className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                      >
                        <MessageSquarePlus size={14} />
                        {tr('添加节点', 'Add Step')}
                      </button>
                    )}
                  </div>
                  <div className="space-y-4">
                    {timeline.map((item, index) => (
                      <div key={item.id} className="border-l border-black/12 pl-4">
                        <EditableText
                          editable={editable}
                          value={item.dateString}
                          rows={1}
                          onChange={(value) => updateTimeline(index, 'dateString', value)}
                          placeholder={tr('时间点', 'Time Marker')}
                          className="text-xs tracking-[0.28em] uppercase text-black/35"
                          editingClassName="w-full resize-none overflow-hidden rounded-xl border border-black/8 bg-white/70 px-2 py-1 text-xs uppercase tracking-[0.28em] text-black/45 outline-none transition placeholder:text-black/20 focus:border-black/20"
                        />
                        <EditableText
                          editable={editable}
                          value={item.description}
                          rows={2}
                          onChange={(value) => updateTimeline(index, 'description', value)}
                          placeholder={tr('这里写这一步发生了什么', 'Describe what happened at this step')}
                          className="mt-1 whitepaper-handwriting text-[1.2rem] leading-[1.45] text-black/80 md:text-[1.45rem]"
                          editingClassName="mt-2 w-full resize-none overflow-hidden rounded-2xl border border-black/8 bg-white/70 px-3 py-2 whitepaper-handwriting text-[1.2rem] leading-[1.45] text-black/80 outline-none transition placeholder:text-black/20 focus:border-black/20 md:text-[1.45rem]"
                          style={scaleFont('clamp(1.2rem, 2vw, 1.45rem)')}
                          editingStyle={scaleFont('clamp(1.2rem, 2vw, 1.45rem)')}
                        />
                        {editable && timeline.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTimelineItem(index)}
                            className="mt-3 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                          >
                            <Trash2 size={14} />
                            {tr('删除节点', 'Delete Step')}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>)
              )}
            </aside>
          )}
        </section>

        {(editable || paperNotes.length > 0) && (
          renderModuleShell('notes', <section className="whitepaper-layout-section whitepaper-layout-section--notes border-t border-black/10 pt-8">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-black/55">
                <NotebookText size={16} />
                {tr('纸边批注', 'Paper Notes')}
              </div>
              {editable && (
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={spreadPaperNotes}
                    className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                  >
                    <Sparkles size={14} />
                    {tr('散开排布', 'Spread Out')}
                  </button>
                  <button
                    type="button"
                    onClick={onAddPaperNote}
                    className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                  >
                    <MessageSquarePlus size={14} />
                    {tr('添加贴纸', 'Add Note')}
                  </button>
                </div>
              )}
            </div>

            <div
              ref={noteBoardRef}
              className={`whitepaper-note-board relative min-h-[13rem] rounded-[30px] border border-black/8 bg-[rgba(255,252,246,0.72)] px-4 py-5 ${isAnyPhysicalDragging ? 'is-reacting' : ''}`}
              style={{
                minHeight: `${noteBoardMinHeight}px`,
              }}
            >
              {paperNotes.map((note) => {
                const toneClassName =
                  note.tone === 'blue'
                    ? 'whitepaper-note--blue'
                    : note.tone === 'charcoal'
                      ? 'whitepaper-note--charcoal'
                      : 'whitepaper-note--amber';
                const layerClassName = note.layer === 'back' ? 'whitepaper-note--back' : 'whitepaper-note--front';
                const noteLayer = note.layer === 'back' ? 'back' : 'front';
                const noteMotion = noteMotions[note.id] || ZERO_PHYSICAL_MOTION;

                return (
                  <article
                    key={note.id}
                    data-note-id={note.id}
                    className={`whitepaper-note absolute w-[10.8rem] ${toneClassName} ${layerClassName} ${draggingNoteID === note.id ? 'is-dragging' : ''} ${settlingNoteIDs.includes(note.id) ? 'is-settling' : ''}`}
                    style={{
                      transform: buildPhysicalTransform(
                        note.offsetX,
                        note.offsetY,
                        note.rotation,
                        1,
                        noteMotion,
                      ),
                      zIndex: note.layer === 'back' ? 5 : 18,
                    }}
                  >
                    <div
                      className="whitepaper-note__sheet rounded-[26px] px-4 py-4"
                      style={{
                        boxShadow: buildPaperShadow(note.rotation, noteLayer, 'note'),
                      }}
                    >
                      {editable && (
                        <button
                          type="button"
                          onPointerDown={(event) => {
                            event.preventDefault();
                            handleNotePointerDown(note, event);
                          }}
                          className="mb-2 inline-flex cursor-grab select-none touch-none items-center gap-1 rounded-full bg-black/8 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-black/45 active:cursor-grabbing"
                        >
                          <Move size={10} />
                          {tr('拖动', 'Drag')}
                        </button>
                      )}
                      <EditableText
                        editable={editable}
                        value={note.text}
                        rows={4}
                        onChange={(value) =>
                          updatePaperNote(note.id, (currentNote) => ({
                            ...currentNote,
                            text: value,
                          }))
                        }
                        placeholder={tr('贴一张批注，把零散念头写在纸边', 'Pin a note here and leave a loose thought on the edge of the paper')}
                        className="whitepaper-handwriting text-[1.18rem] leading-[1.55] text-black/80"
                        editingClassName="w-full resize-none overflow-hidden border-none bg-transparent p-0 whitepaper-handwriting text-[1.18rem] leading-[1.55] text-black/80 outline-none placeholder:text-black/25"
                        style={scaleFont('1.18rem')}
                        editingStyle={scaleFont('1.18rem')}
                      />
                    </div>

                    {editable && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updatePaperNote(note.id, (currentNote) => ({
                              ...currentNote,
                              rotation: currentNote.rotation - 4,
                            }))
                          }
                          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                        >
                          <RotateCcw size={12} />
                          {tr('左转', 'Left')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updatePaperNote(note.id, (currentNote) => ({
                              ...currentNote,
                              rotation: currentNote.rotation + 4,
                            }))
                          }
                          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                        >
                          <RotateCw size={12} />
                          {tr('右转', 'Right')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updatePaperNote(note.id, (currentNote) => ({
                              ...currentNote,
                              tone:
                                currentNote.tone === 'amber'
                                  ? 'blue'
                                  : currentNote.tone === 'blue'
                                    ? 'charcoal'
                                    : 'amber',
                            }))
                          }
                          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                        >
                          {tr('切换颜色', 'Change Color')}
                        </button>
                        <button
                          type="button"
                          onClick={() => snapPaperNotePosition(note.id)}
                          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                        >
                          <Move size={12} />
                          {tr('贴边', 'Snap')}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => placePaperNoteAtAnchor(note.id, 'top-left', event.currentTarget.closest('[data-note-id]') as HTMLElement | null)}
                          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                        >
                          {tr('左上', 'Top Left')}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => placePaperNoteAtAnchor(note.id, 'top-right', event.currentTarget.closest('[data-note-id]') as HTMLElement | null)}
                          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                        >
                          {tr('右上', 'Top Right')}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => placePaperNoteAtAnchor(note.id, 'bottom-left', event.currentTarget.closest('[data-note-id]') as HTMLElement | null)}
                          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                        >
                          {tr('左下', 'Bottom Left')}
                        </button>
                        <button
                          type="button"
                          onClick={(event) => placePaperNoteAtAnchor(note.id, 'bottom-right', event.currentTarget.closest('[data-note-id]') as HTMLElement | null)}
                          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                        >
                          {tr('右下', 'Bottom Right')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updatePaperNote(note.id, (currentNote) => ({
                              ...currentNote,
                              layer: 'front',
                            }))
                          }
                          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                        >
                          {tr('置顶', 'Bring Front')}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updatePaperNote(note.id, (currentNote) => ({
                              ...currentNote,
                              layer: 'back',
                            }))
                          }
                          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                        >
                          {tr('置底', 'Send Back')}
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemovePaperNote?.(note.id)}
                          className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-[11px] text-neutral-700 transition hover:bg-white"
                        >
                          <Trash2 size={12} />
                          {tr('删除', 'Delete')}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}

              {!editable && paperNotes.length === 0 && (
                <div className="text-sm leading-6 text-black/30">{tr('这张白纸没有额外贴上的批注。', 'There are no extra notes pinned to this sheet.')}</div>
              )}
            </div>
          </section>)
        )}

        {showConclusion && (
          renderModuleShell('closing', <section className="whitepaper-layout-section whitepaper-layout-section--closing border-t border-black/10 pt-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.2em] text-black/55 uppercase">
                <NotebookText size={16} />
                {tr('白纸结论', 'Closing Notes')}
              </div>
              {editable && (
                <button
                  type="button"
                  onClick={addObservation}
                  className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                >
                  <MessageSquarePlus size={14} />
                  {tr('添加结论', 'Add Note')}
                </button>
              )}
            </div>
            <div className="flex flex-col gap-3">
              {observations.map((observation, index) => (
                <div key={`${index}-${observation}`} className="flex flex-col gap-2">
                  <EditableText
                    editable={editable}
                    value={observation}
                    rows={2}
                    onChange={(value) => updateArrayItem('observations', index, value)}
                    placeholder={tr(`补一条结论或余波 ${index + 1}`, `Add one more conclusion or aftereffect ${index + 1}`)}
                    className="whitepaper-handwriting text-[1.3rem] leading-[1.55] text-black/78 md:text-[1.6rem]"
                    editingClassName="w-full resize-none overflow-hidden rounded-2xl border border-black/8 bg-white/55 px-4 py-3 whitepaper-handwriting text-[1.3rem] leading-[1.55] text-black/78 outline-none transition placeholder:text-black/20 focus:border-black/20 focus:bg-white/78 md:text-[1.6rem]"
                    style={scaleFont('clamp(1.3rem, 2.4vw, 1.6rem)')}
                    editingStyle={scaleFont('clamp(1.3rem, 2.4vw, 1.6rem)')}
                  />
                  {editable && observations.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeObservation(index)}
                      className="inline-flex w-fit items-center gap-2 rounded-full border border-black/10 bg-white/75 px-4 py-2 text-xs font-medium text-neutral-700 transition hover:bg-white"
                    >
                      <Trash2 size={14} />
                      {tr('删除这一条', 'Delete Note')}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <EditableText
              editable={editable}
              value={aiGeneratedData.closing}
              rows={3}
              onChange={(value) => updateField('closing', value)}
              placeholder={tr('最后留一句收尾，让整张纸落下来', 'Leave one final line so the whole sheet can land')}
              className="mt-8 whitepaper-handwriting text-[1.65rem] leading-[1.55] text-black/85 md:text-[2rem]"
              editingClassName="mt-8 w-full resize-none overflow-hidden rounded-[24px] border border-black/8 bg-white/55 px-4 py-3 whitepaper-handwriting text-[1.65rem] leading-[1.55] text-black/85 outline-none transition placeholder:text-black/20 focus:border-black/20 focus:bg-white/78 md:text-[2rem]"
              style={scaleFont('clamp(1.65rem, 3vw, 2rem)')}
              editingStyle={scaleFont('clamp(1.65rem, 3vw, 2rem)')}
            />
          </section>)
        )}
      </div>
    </section>
  );
}
