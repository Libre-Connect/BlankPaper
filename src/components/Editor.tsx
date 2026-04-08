import { WhitepaperEvent } from '@/types';
import { Image, Link, Sparkles } from 'lucide-react';

interface EditorProps {
  event: WhitepaperEvent;
  draft: string;
  isGenerating: boolean;
  onTitleChange: (title: string) => void;
  onDraftChange: (draft: string) => void;
  onGenerate: () => void;
}

export function Editor({
  event,
  draft,
  isGenerating,
  onTitleChange,
  onDraftChange,
  onGenerate,
}: EditorProps) {
  return (
    <div className="flex flex-col gap-6 w-full max-w-3xl mx-auto p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-gray-900">一张白纸，自由表达</h1>
        <p className="text-gray-500">在这里输入你想表明的事件，AI将为你整理</p>
      </div>

      <input
        type="text"
        value={event.title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="输入事件标题..."
        className="w-full px-4 py-3 text-xl font-medium bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
      />

      <textarea
        value={draft}
        onChange={(e) => onDraftChange(e.target.value)}
        placeholder="写下你所知道的全部事实..."
        className="w-full min-h-[300px] px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl resize-y focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
      />

      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
            <Image size={18} />
            上传截图
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors">
            <Link size={18} />
            添加链接
          </button>
        </div>

        <button
          onClick={onGenerate}
          disabled={!draft.trim() || isGenerating}
          className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-sm transition-all"
        >
          {isGenerating ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Sparkles size={18} />
          )}
          {isGenerating ? 'AI 整理中...' : 'AI 整理摘要 & 时间线'}
        </button>
      </div>
    </div>
  );
}
