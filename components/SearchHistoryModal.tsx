'use client';

import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  X,
  Trash2,
  Clock,
  Folder,
  Film,
  Layers,
  Sparkles,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

export interface SearchHistoryItem {
  id: string;
  query: string;
  groupId?: string;
  groupName?: string;
  videoId?: string;
  videoTitle?: string;
  resultCount: number;
  hasResults?: boolean;
  isSegmented: boolean;
  segmentCount: number;
  createdAt: string;
}

interface SearchHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSearch: (searchId: string, item?: SearchHistoryItem) => void;
  currentSearchId?: string | null;
}

export default function SearchHistoryModal({
  isOpen,
  onClose,
  onSelectSearch,
  currentSearchId,
}: SearchHistoryModalProps) {
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/search/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch (e) {
      console.error('Failed to load search history:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDeleteItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      const res = await fetch(`/api/search/history/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setHistory((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (e) {
      console.error('Failed to delete search item:', e);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Are you sure you want to clear all semantic search history?')) {
      return;
    }
    try {
      const res = await fetch('/api/search/history', { method: 'DELETE' });
      if (res.ok) {
        setHistory([]);
      }
    } catch (e) {
      console.error('Failed to clear search history:', e);
    }
  };

  const filteredHistory = history.filter((h) => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return (
      h.query.toLowerCase().includes(q) ||
      (h.groupName && h.groupName.toLowerCase().includes(q)) ||
      (h.videoTitle && h.videoTitle.toLowerCase().includes(q))
    );
  });

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffSec < 60) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHour < 24) return `${diffHour}h ago`;
      if (diffDay === 1) return 'Yesterday';
      if (diffDay < 7) return `${diffDay}d ago`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden z-10 animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <span>Semantic Search History</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                  {history.length}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Instantly load cached results or re-run queries
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {history.length > 0 && (
              <button
                type="button"
                onClick={handleClearAll}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-[11px] text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-slate-800 hover:border-red-500/30 transition-colors"
                title="Clear all search history"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Input */}
        {history.length > 3 && (
          <div className="px-6 py-2.5 border-b border-slate-800/60 bg-slate-900/30">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filter saved queries..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-900/90 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
        )}

        {/* History List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-slate-800/40">
          {loading ? (
            <div className="p-14 text-center space-y-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center mx-auto text-blue-400">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
              <p className="text-xs text-slate-400 font-medium">Loading search history...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <History className="w-10 h-10 text-slate-600 mx-auto" />
              <h4 className="text-sm font-semibold text-slate-300">No search history yet</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Any queries or multi-sentence prompts you search will be automatically preserved here so you can recheck previous results anytime.
              </p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No previous searches match "{filterQuery}".
            </div>
          ) : (
            filteredHistory.map((item) => {
              const isCurrent = currentSearchId === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    onSelectSearch(item.id, item);
                    onClose();
                  }}
                  className={`pt-2.5 first:pt-0 p-3 rounded-2xl cursor-pointer transition-all flex items-start justify-between gap-3 group ${
                    isCurrent
                      ? 'bg-blue-600/10 border border-blue-500/30'
                      : 'hover:bg-slate-900/80 hover:border-slate-800 border border-transparent'
                  }`}
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                      <span className="text-slate-400 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {formatRelativeTime(item.createdAt)}
                      </span>

                      {item.groupName && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold">
                          <Folder className="w-2.5 h-2.5 text-indigo-400" />
                          <span>{item.groupName}</span>
                        </span>
                      )}

                      {item.videoTitle && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[10px] font-semibold max-w-[160px] truncate" title={item.videoTitle}>
                          <Film className="w-2.5 h-2.5 text-blue-400 shrink-0" />
                          <span className="truncate">{item.videoTitle}</span>
                        </span>
                      )}

                      {item.isSegmented && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] font-semibold">
                          <Layers className="w-2.5 h-2.5 text-cyan-400" />
                          <span>{item.segmentCount} segments</span>
                        </span>
                      )}

                      <span className="text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md text-[10px] font-semibold">
                        {item.resultCount} {item.resultCount === 1 ? 'match' : 'matches'}
                      </span>

                      {item.hasResults && (
                        <span className="text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1" title="Permanently saved on disk in database: loads found scenes instantly">
                          <CheckCircle2 className="w-2.5 h-2.5 text-blue-400" />
                          <span>Saved Results</span>
                        </span>
                      )}
                    </div>

                    <p className="text-xs font-medium text-slate-200 line-clamp-2 leading-relaxed group-hover:text-blue-300 transition-colors">
                      "{item.query}"
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 pt-1">
                    <button
                      type="button"
                      onClick={(e) => handleDeleteItem(e, item.id)}
                      disabled={deletingId === item.id}
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800/80 rounded-lg transition-colors opacity-60 group-hover:opacity-100"
                      title="Delete this search"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="p-1.5 text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between text-xs text-slate-500">
          <span>
            {history.length} saved {history.length === 1 ? 'search' : 'searches'} in local database
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
