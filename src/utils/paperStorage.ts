import { WhitepaperEvent } from '@/types';

const STORAGE_KEY = 'blankpapers';
const LEGACY_STORAGE_KEY = 'whitepapers';
const CLIENT_ID_STORAGE_KEY = 'blankpaper-client-id';

type SerializedPaper = Omit<WhitepaperEvent, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

const toDate = (value: unknown) => {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const nextDate = new Date(value);
    if (!Number.isNaN(nextDate.getTime())) return nextDate;
  }
  return new Date();
};

const hydratePaper = (paper: SerializedPaper | WhitepaperEvent): WhitepaperEvent => ({
  ...paper,
  createdAt: toDate(paper.createdAt),
  updatedAt: toDate(paper.updatedAt),
});

const serializePaper = (paper: WhitepaperEvent): SerializedPaper => ({
  ...paper,
  createdAt: toDate(paper.createdAt).toISOString(),
  updatedAt: toDate(paper.updatedAt).toISOString(),
});

const parseStoredPapers = (rawValue: string | null): WhitepaperEvent[] => {
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue) as SerializedPaper[];
    return parsed.map(hydratePaper);
  } catch {
    return [];
  }
};

const readLocalPapers = (): WhitepaperEvent[] => {
  if (typeof window === 'undefined') return [];

  const currentValue = localStorage.getItem(STORAGE_KEY);
  const currentPapers = parseStoredPapers(currentValue);

  if (currentValue !== null) {
    return currentPapers;
  }

  const legacyPapers = parseStoredPapers(localStorage.getItem(LEGACY_STORAGE_KEY));

  if (legacyPapers.length > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyPapers.map(serializePaper)));
  }

  return legacyPapers;
};

const writeLocalPapers = (papers: WhitepaperEvent[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(papers.map(serializePaper)));
};

const mergePapersById = (existing: WhitepaperEvent[], incoming: WhitepaperEvent[]) => {
  const map = new Map<string, WhitepaperEvent>();

  [...existing, ...incoming].forEach((paper) => {
    const current = map.get(paper.id);
    if (!current || toDate(paper.updatedAt).getTime() >= toDate(current.updatedAt).getTime()) {
      map.set(paper.id, hydratePaper(paper));
    }
  });

  return Array.from(map.values()).sort((left, right) => toDate(right.updatedAt).getTime() - toDate(left.updatedAt).getTime());
};

const fetchPapersFromServer = async (searchParams: URLSearchParams) => {
  const response = await fetch(`/api/papers?${searchParams.toString()}`, {
    method: 'GET',
    cache: 'no-store',
  });
  const result = (await response.json()) as { papers?: SerializedPaper[]; error?: string };

  if (!response.ok) {
    throw new Error(result.error || 'Failed to fetch papers.');
  }

  return (result.papers || []).map(hydratePaper);
};

export const getClientAuthorId = () => {
  if (typeof window === 'undefined') return 'anon-local';

  const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) return existing;

  const nextID = window.crypto?.randomUUID?.() || `anon-${Date.now().toString(36)}`;
  window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, nextID);
  return nextID;
};

export const savePaperToLocal = (paper: WhitepaperEvent) => {
  if (typeof window === 'undefined') return;

  const merged = mergePapersById(readLocalPapers(), [paper]);
  writeLocalPapers(merged);
};

export const savePaperToServer = async (paper: WhitepaperEvent) => {
  const response = await fetch('/api/papers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      paper: serializePaper(paper),
    }),
  });

  const result = (await response.json()) as { paper?: SerializedPaper; error?: string };

  if (!response.ok || !result.paper) {
    throw new Error(result.error || 'Failed to save paper.');
  }

  const savedPaper = hydratePaper(result.paper);
  savePaperToLocal(savedPaper);
  return savedPaper;
};

export const getPublicPapers = (): WhitepaperEvent[] => {
  return readLocalPapers().filter((paper) => paper.isPublic === true);
};

export const getPapersByCode = (code: string): WhitepaperEvent[] => {
  return readLocalPapers().filter((paper) => paper.secretCode === code);
};

export const getUserPapers = (): WhitepaperEvent[] => {
  return readLocalPapers();
};

export const fetchPublicPapers = async (): Promise<WhitepaperEvent[]> => {
  try {
    const papers = await fetchPapersFromServer(new URLSearchParams({ scope: 'public' }));
    writeLocalPapers(mergePapersById(readLocalPapers(), papers));
    return papers;
  } catch {
    return getPublicPapers();
  }
};

export const fetchPapersByCode = async (code: string): Promise<WhitepaperEvent[]> => {
  try {
    const papers = await fetchPapersFromServer(new URLSearchParams({ scope: 'secret', secretCode: code }));
    writeLocalPapers(mergePapersById(readLocalPapers(), papers));
    return papers;
  } catch {
    return getPapersByCode(code);
  }
};

export const fetchUserPapers = async (authorID: string): Promise<WhitepaperEvent[]> => {
  try {
    const papers = await fetchPapersFromServer(new URLSearchParams({ scope: 'mine', authorID }));
    writeLocalPapers(mergePapersById(readLocalPapers(), papers));
    return papers;
  } catch {
    return getUserPapers().filter(
      (paper) =>
        paper.collaboration?.authorID === authorID ||
        paper.collaboration?.contributors?.includes(authorID),
    );
  }
};
