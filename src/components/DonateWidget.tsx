'use client';

import { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';

const DONATE_URL = 'https://ko-fi.com/liberconnect/?hidefeed=true&widget=true&embed=true';
const DONATE_LABEL = 'Support';

export function DonateWidget() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <div className="fixed bottom-5 right-5 z-[160] flex flex-col items-end gap-3">
      {isOpen && (
        <div className="w-[320px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[24px] border border-white/14 bg-[#121318]/92 shadow-[0_24px_70px_rgba(0,0,0,0.38)] backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Heart size={14} className="fill-white text-white" />
              <span>{DONATE_LABEL}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full border border-white/12 px-2 py-1 text-[11px] text-white/80 transition hover:bg-white/8 hover:text-white"
            >
              Close
            </button>
          </div>
          <iframe
            src={DONATE_URL}
            title="Support on Ko-fi"
            loading="lazy"
            className="h-[430px] w-full border-0 bg-white"
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setIsOpen((previous) => !previous)}
        aria-label={DONATE_LABEL}
        title={DONATE_LABEL}
        className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/72 px-3 py-2 text-xs font-semibold tracking-[0.02em] text-white shadow-[0_12px_28px_rgba(0,0,0,0.22)] backdrop-blur-md transition hover:translate-y-[-1px] hover:bg-black/82"
      >
        <Heart size={14} className="fill-white text-white" />
        <span>{DONATE_LABEL}</span>
      </button>
    </div>
  );
}
