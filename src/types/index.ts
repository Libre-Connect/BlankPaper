export interface TimelineEvent {
  id: string;
  dateString: string;
  description: string;
}

export type PaperLayoutPreset = 'minimal' | 'editorial' | 'evidence' | 'timeline' | 'scrapbook';
export type PaperLayoutMode = 'ai' | PaperLayoutPreset;
export type PaperModuleKey = 'lead' | 'body' | 'reference' | 'media' | 'factCards' | 'timeline' | 'notes' | 'closing';

export interface WhitepaperFactCard {
  id: string;
  label: string;
  value: string;
}

export interface AIGeneratedData {
  headline: string;
  subtitle: string;
  lead: string;
  handwrittenBody: string[];
  factCards: WhitepaperFactCard[];
  timeline: TimelineEvent[];
  observations: string[];
  closing: string;
  imageInsight?: string;
  layoutRecommendation: PaperLayoutPreset;
  model: string;
}

export interface WhitepaperReferenceImage {
  src: string;
  alt: string;
  name?: string;
  rotation?: number;
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  layer?: 'front' | 'back';
}

export interface WhitepaperMediaItem {
  id: string;
  kind: 'image' | 'audio';
  src: string;
  name?: string;
  alt?: string;
  caption: string;
  offsetX: number;
  offsetY: number;
  rotation: number;
  scale: number;
  layer?: 'front' | 'back';
  mimeType?: string;
}

export interface WhitepaperNote {
  id: string;
  text: string;
  offsetX: number;
  offsetY: number;
  rotation: number;
  tone: 'amber' | 'blue' | 'charcoal';
  layer?: 'front' | 'back';
}

export interface PaperModuleTransform {
  offsetX: number;
  offsetY: number;
  rotation: number;
  layer?: 'front' | 'back';
}

export interface CollaborationData {
  authorID: string;
  isForked: boolean;
  originalEventID?: string;
  contributors: string[];
}

export interface WhitepaperEvent {
  id: string;
  title: string;
  originalContent: string;
  aiGeneratedData?: AIGeneratedData;
  referenceImage?: WhitepaperReferenceImage;
  mediaItems?: WhitepaperMediaItem[];
  paperNotes?: WhitepaperNote[];
  collaboration: CollaborationData;
  isPublic?: boolean;
  secretCode?: string;
  backgroundEffect?: string;
  fontScale?: number;
  layoutMode?: PaperLayoutMode;
  moduleTransforms?: Partial<Record<PaperModuleKey, PaperModuleTransform>>;
  createdAt: Date;
  updatedAt: Date;
}

export interface GenerateWhitepaperRequestPayload {
  title: string;
  prompt: string;
  imageDataUrls?: string[];
  locale?: 'zh' | 'en';
}

export interface GenerateWhitepaperResponsePayload {
  data: AIGeneratedData;
}
