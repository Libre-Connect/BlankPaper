import type { PaperLayoutMode, PaperLayoutPreset } from '@/types';

export const PAPER_LAYOUT_PRESETS: PaperLayoutPreset[] = ['minimal', 'editorial', 'evidence', 'timeline', 'scrapbook'];
export const PAPER_LAYOUT_MODES: PaperLayoutMode[] = ['ai', ...PAPER_LAYOUT_PRESETS];

export function isPaperLayoutPreset(value: unknown): value is PaperLayoutPreset {
  return typeof value === 'string' && PAPER_LAYOUT_PRESETS.includes(value as PaperLayoutPreset);
}

export function isPaperLayoutMode(value: unknown): value is PaperLayoutMode {
  return typeof value === 'string' && PAPER_LAYOUT_MODES.includes(value as PaperLayoutMode);
}

export function resolvePaperLayout(layoutMode: PaperLayoutMode | undefined, layoutRecommendation: PaperLayoutPreset | undefined) {
  if (layoutMode === 'ai') {
    return layoutRecommendation || 'minimal';
  }

  return layoutMode || 'minimal';
}
