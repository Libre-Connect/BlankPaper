import { WhitepaperEvent } from '@/types';

const STORAGE_KEY = 'blankpapers';
const LEGACY_STORAGE_KEY = 'whitepapers';

const parseStoredPapers = (rawValue: string | null): WhitepaperEvent[] => {
  if (!rawValue) return [];

  try {
    return JSON.parse(rawValue) as WhitepaperEvent[];
  } catch {
    return [];
  }
};

const getStoredPapers = (): WhitepaperEvent[] => {
  if (typeof window === 'undefined') return [];

  const currentValue = localStorage.getItem(STORAGE_KEY);
  const currentPapers = parseStoredPapers(currentValue);

  if (currentValue !== null) {
    return currentPapers;
  }

  const legacyPapers = parseStoredPapers(localStorage.getItem(LEGACY_STORAGE_KEY));

  if (legacyPapers.length > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyPapers));
  }

  return legacyPapers;
};

export const savePaperToLocal = (paper: WhitepaperEvent) => {
  if (typeof window === 'undefined') return;

  const existing = getStoredPapers();
  const index = existing.findIndex((item: WhitepaperEvent) => item.id === paper.id);

  if (index !== -1) {
    existing[index] = paper;
  } else {
    existing.unshift(paper);
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
};

export const getPublicPapers = (): WhitepaperEvent[] => {
  const existing = getStoredPapers();
  return existing.filter((paper: WhitepaperEvent) => paper.isPublic === true);
};

export const getPapersByCode = (code: string): WhitepaperEvent[] => {
  const existing = getStoredPapers();
  return existing.filter((paper: WhitepaperEvent) => paper.secretCode === code);
};

export const getUserPapers = (): WhitepaperEvent[] => {
  return getStoredPapers();
};

export const hasPaperInLocal = (paperID: string) => {
  if (typeof window === 'undefined') return false;
  return getStoredPapers().some((paper: WhitepaperEvent) => paper.id === paperID);
};
