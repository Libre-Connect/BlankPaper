import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { WhitepaperEvent } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SerializedPaper = Omit<WhitepaperEvent, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};

const DATA_DIR = path.join(process.cwd(), 'data');
const PAPERS_FILE = path.join(DATA_DIR, 'papers.json');

const toDate = (value: unknown) => {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const nextDate = new Date(value);
    if (!Number.isNaN(nextDate.getTime())) return nextDate;
  }
  return new Date();
};

const serializePaper = (paper: WhitepaperEvent | SerializedPaper): SerializedPaper => {
  const authorID = paper.collaboration?.authorID || 'anon-local';

  return {
    ...paper,
    collaboration: {
      authorID,
      isForked: Boolean(paper.collaboration?.isForked),
      originalEventID: paper.collaboration?.originalEventID,
      contributors: Array.from(new Set([...(paper.collaboration?.contributors || []), authorID])),
    },
    createdAt: toDate(paper.createdAt).toISOString(),
    updatedAt: toDate(paper.updatedAt).toISOString(),
  };
};

const hydratePaper = (paper: SerializedPaper): WhitepaperEvent => ({
  ...paper,
  createdAt: toDate(paper.createdAt),
  updatedAt: toDate(paper.updatedAt),
});

const ensureStore = async () => {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(PAPERS_FILE);
  } catch {
    await fs.writeFile(PAPERS_FILE, '[]', 'utf8');
  }
};

const readStore = async (): Promise<SerializedPaper[]> => {
  await ensureStore();

  try {
    const raw = await fs.readFile(PAPERS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as SerializedPaper[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStore = async (papers: SerializedPaper[]) => {
  await ensureStore();
  await fs.writeFile(PAPERS_FILE, JSON.stringify(papers, null, 2), 'utf8');
};

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
};

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get('scope') || 'public';
  const secretCode = request.nextUrl.searchParams.get('secretCode') || '';
  const authorID = request.nextUrl.searchParams.get('authorID') || '';
  const papers = await readStore();

  let filtered: SerializedPaper[];

  if (scope === 'public') {
    filtered = papers.filter((paper) => paper.isPublic === true);
  } else if (scope === 'secret') {
    if (!secretCode.trim()) {
      return NextResponse.json({ error: 'secretCode is required.' }, { status: 400, headers: noStoreHeaders });
    }

    filtered = papers.filter((paper) => paper.secretCode === secretCode.trim());
  } else if (scope === 'mine') {
    if (!authorID.trim()) {
      return NextResponse.json({ error: 'authorID is required.' }, { status: 400, headers: noStoreHeaders });
    }

    filtered = papers.filter(
      (paper) =>
        paper.collaboration?.authorID === authorID ||
        paper.collaboration?.contributors?.includes(authorID),
    );
  } else {
    return NextResponse.json({ error: 'Unsupported scope.' }, { status: 400, headers: noStoreHeaders });
  }

  filtered.sort((left, right) => toDate(right.updatedAt).getTime() - toDate(left.updatedAt).getTime());

  return NextResponse.json(
    {
      papers: filtered.map((paper) => serializePaper(hydratePaper(paper))),
    },
    { headers: noStoreHeaders },
  );
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as { paper?: SerializedPaper | WhitepaperEvent };

    if (!payload.paper?.id) {
      return NextResponse.json({ error: 'paper.id is required.' }, { status: 400, headers: noStoreHeaders });
    }

    const incomingPaper = serializePaper(payload.paper);
    const papers = await readStore();
    const existingIndex = papers.findIndex((paper) => paper.id === incomingPaper.id);

    if (existingIndex >= 0) {
      incomingPaper.createdAt = papers[existingIndex].createdAt;
      papers[existingIndex] = incomingPaper;
    } else {
      papers.unshift(incomingPaper);
    }

    papers.sort((left, right) => toDate(right.updatedAt).getTime() - toDate(left.updatedAt).getTime());
    await writeStore(papers);

    return NextResponse.json({ paper: incomingPaper }, { headers: noStoreHeaders });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save paper.' },
      { status: 500, headers: noStoreHeaders },
    );
  }
}
