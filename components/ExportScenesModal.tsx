'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  FileText,
  FileCode,
  AlignLeft,
  ListFilter,
  Layers,
  Sparkles,
  Clock,
  Settings2
} from 'lucide-react';
import { VideoScene } from '@/lib/db/types';
import { formatTime } from '@/components/VideoPlayer';

export interface ExportScenesModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenes: VideoScene[];
  videoTitle?: string;
  videoDuration?: number;
}

export type ExportFormat = 'narrative' | 'timestamped' | 'markdown' | 'json';

export default function ExportScenesModal({
  isOpen,
  onClose,
  scenes,
  videoTitle = 'Video Scenes',
  videoDuration = 0,
}: ExportScenesModalProps) {
  const [format, setFormat] = useState<ExportFormat>('timestamped');
  const [includeSceneNumbers, setIncludeSceneNumbers] = useState(true);
  const [includeTimestamps, setIncludeTimestamps] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(false);
  const [paragraphBreaks, setParagraphBreaks] = useState(true);
  const [copied, setCopied] = useState(false);

  // Close on Escape key and reset default to timestamped on open
  React.useEffect(() => {
    if (!isOpen) return;
    setFormat('timestamped');
    setIncludeTimestamps(true);
    setIncludeSceneNumbers(true);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Sort scenes by sceneNumber or startTime
  const sortedScenes = useMemo(() => {
    return [...scenes].sort((a, b) => {
      if (a.sceneNumber && b.sceneNumber) return a.sceneNumber - b.sceneNumber;
      return a.startTime - b.startTime;
    });
  }, [scenes]);

  // Generate exported content based on mode and options
  const generatedContent = useMemo(() => {
    if (!sortedScenes || sortedScenes.length === 0) {
      return 'No scenes available to export.';
    }

    if (format === 'narrative') {
      // Merged narrative of all descriptions
      const items = sortedScenes.map((s, idx) => {
        let prefix = '';
        if (includeSceneNumbers && includeTimestamps) {
          prefix = `[${formatTime(s.startTime)} - ${formatTime(s.endTime)}] Scene #${s.sceneNumber || idx + 1}: `;
        } else if (includeSceneNumbers) {
          prefix = `Scene #${s.sceneNumber || idx + 1}: `;
        } else if (includeTimestamps) {
          prefix = `[${formatTime(s.startTime)} - ${formatTime(s.endTime)}] `;
        }
        return `${prefix}${s.description.trim()}`;
      });

      return items.join(paragraphBreaks ? '\n\n' : ' ');
    }

    if (format === 'timestamped') {
      // Script / Timestamped log
      return sortedScenes
        .map((s, idx) => {
          const time = `[${formatTime(s.startTime)} → ${formatTime(s.endTime)}]`;
          const num = includeSceneNumbers ? `Scene #${s.sceneNumber || idx + 1}` : '';
          const header = [time, num].filter(Boolean).join(' ');
          let entry = `${header}: ${s.description.trim()}`;

          if (includeMetadata) {
            const metaParts: string[] = [];
            if (s.location) metaParts.push(`Location: ${s.location}`);
            if (s.people && s.people.length > 0) metaParts.push(`Characters: ${s.people.join(', ')}`);
            if (s.actions && s.actions.length > 0) metaParts.push(`Actions: ${s.actions.join(', ')}`);
            if (s.objects && s.objects.length > 0) metaParts.push(`Objects: ${s.objects.join(', ')}`);

            if (metaParts.length > 0) {
              entry += `\n  ↳ ${metaParts.join(' | ')}`;
            }
          }
          return entry;
        })
        .join('\n\n');
    }

    if (format === 'markdown') {
      const header = [
        `# ${videoTitle} - Scene Descriptions`,
        ``,
        `- **Total Scenes**: ${sortedScenes.length}`,
        `- **Duration**: ${formatTime(videoDuration)}`,
        `- **Exported At**: ${new Date().toLocaleString()}`,
        ``,
        `## Merged Narrative Synopsis`,
        ``,
        sortedScenes.map((s) => s.description.trim()).join(' '),
        ``,
        `---`,
        ``,
        `## Scene-by-Scene Breakdown`,
        ``,
      ].join('\n');

      const body = sortedScenes
        .map((s, idx) => {
          const lines = [
            `### Scene ${s.sceneNumber || idx + 1} (${formatTime(s.startTime)} - ${formatTime(s.endTime)})`,
            ``,
            s.description.trim(),
            ``,
          ];

          if (includeMetadata) {
            if (s.location) lines.push(`- **Location**: ${s.location}`);
            if (s.people && s.people.length > 0) lines.push(`- **People/Characters**: ${s.people.join(', ')}`);
            if (s.actions && s.actions.length > 0) lines.push(`- **Actions**: ${s.actions.join(', ')}`);
            if (s.objects && s.objects.length > 0) lines.push(`- **Objects**: ${s.objects.join(', ')}`);
            lines.push(``);
          }

          return lines.join('\n');
        })
        .join('\n');

      return header + body;
    }

    if (format === 'json') {
      const mergedDescriptions = sortedScenes.map((s) => s.description.trim()).join(' ');
      const exportData = {
        title: videoTitle,
        totalScenes: sortedScenes.length,
        durationSeconds: videoDuration,
        durationFormatted: formatTime(videoDuration),
        exportedAt: new Date().toISOString(),
        mergedDescription: mergedDescriptions,
        scenes: sortedScenes.map((s, idx) => ({
          sceneNumber: s.sceneNumber || idx + 1,
          startTime: s.startTime,
          endTime: s.endTime,
          startTimeFormatted: formatTime(s.startTime),
          endTimeFormatted: formatTime(s.endTime),
          durationSeconds: s.duration,
          description: s.description,
          location: s.location || null,
          people: s.people || [],
          actions: s.actions || [],
          objects: s.objects || [],
          confidence: s.confidence,
        })),
      };

      return JSON.stringify(exportData, null, 2);
    }

    return '';
  }, [
    sortedScenes,
    format,
    includeSceneNumbers,
    includeTimestamps,
    includeMetadata,
    paragraphBreaks,
    videoTitle,
    videoDuration,
  ]);

  // Statistics
  const stats = useMemo(() => {
    const text = generatedContent;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const readingTimeMins = Math.max(1, Math.ceil(words / 200));
    return { words, chars, readingTimeMins };
  }, [generatedContent]);

  // Copy to clipboard
  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(generatedContent);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = generatedContent;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // Download file helper
  const handleDownload = (customFormat?: ExportFormat) => {
    const fmt = customFormat || format;
    let extension = 'txt';
    let mimeType = 'text/plain;charset=utf-8';

    if (fmt === 'markdown') {
      extension = 'md';
      mimeType = 'text/markdown;charset=utf-8';
    } else if (fmt === 'json') {
      extension = 'json';
      mimeType = 'application/json;charset=utf-8';
    }

    const safeTitle = (videoTitle || 'scenes')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 40);

    const filename = `${safeTitle}_merged_scenes_${sortedScenes.length}.${extension}`;
    const blob = new Blob([generatedContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <span>Export Merged Scene Descriptions</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-mono font-semibold border border-indigo-500/30">
                  {sortedScenes.length} Scenes
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Merge all chronological scene descriptions into a unified story, script, or markdown document.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Selector Tabs */}
        <div className="px-6 pt-4 pb-2 border-b border-slate-800/80 bg-slate-900/30">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-1.5 p-1 rounded-xl bg-slate-800/60 border border-slate-700/60">
              <button
                type="button"
                onClick={() => {
                  setFormat('timestamped');
                  setIncludeTimestamps(true);
                  setIncludeSceneNumbers(true);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                  format === 'timestamped'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Timestamped Script</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('narrative')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                  format === 'narrative'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                <AlignLeft className="w-3.5 h-3.5" />
                <span>Merged Story</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setFormat('markdown');
                  setIncludeMetadata(true);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                  format === 'markdown'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Markdown Doc</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('json')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                  format === 'json'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>JSON</span>
              </button>
            </div>

            {/* Content Stats */}
            <div className="flex items-center space-x-3 text-xs text-slate-400 font-mono">
              <span className="flex items-center space-x-1">
                <strong className="text-slate-200 font-semibold">{stats.words.toLocaleString()}</strong> words
              </span>
              <span>•</span>
              <span className="flex items-center space-x-1">
                <strong className="text-slate-200 font-semibold">{stats.chars.toLocaleString()}</strong> chars
              </span>
              <span>•</span>
              <span className="text-indigo-400">~{stats.readingTimeMins} min read</span>
            </div>
          </div>

          {/* Granular Options & Toggles */}
          {format !== 'json' && (
            <div className="flex flex-wrap items-center gap-4 pt-3 pb-1 text-xs text-slate-300">
              <span className="text-slate-500 font-medium flex items-center space-x-1">
                <Settings2 className="w-3.5 h-3.5" />
                <span>Format Options:</span>
              </span>

              {format === 'narrative' && (
                <label className="flex items-center space-x-2 cursor-pointer hover:text-white transition-colors">
                  <input
                    type="checkbox"
                    checked={paragraphBreaks}
                    onChange={(e) => setParagraphBreaks(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                  />
                  <span>Paragraph breaks per scene</span>
                </label>
              )}

              <label className="flex items-center space-x-2 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={includeSceneNumbers}
                  onChange={(e) => setIncludeSceneNumbers(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                />
                <span>Include Scene Numbers</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={includeTimestamps}
                  onChange={(e) => setIncludeTimestamps(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                />
                <span>Include Timestamps</span>
              </label>

              {(format === 'timestamped' || format === 'markdown') && (
                <label className="flex items-center space-x-2 cursor-pointer hover:text-white transition-colors">
                  <input
                    type="checkbox"
                    checked={includeMetadata}
                    onChange={(e) => setIncludeMetadata(e.target.checked)}
                    className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                  />
                  <span>Include Metadata (Locations, Actions, Characters)</span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Live Preview Area */}
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="relative">
            <textarea
              readOnly
              value={generatedContent}
              rows={16}
              className="w-full bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-200 leading-relaxed focus:outline-none focus:border-indigo-500/50 resize-none selection:bg-indigo-500/30"
              placeholder="Generating merged scene descriptions..."
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400 flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>All {sortedScenes.length} scenes merged sequentially.</span>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopy}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                copied
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/50'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Content</span>
                </>
              )}
            </button>

            {/* Download Buttons */}
            {format === 'narrative' && (
              <button
                type="button"
                onClick={() => handleDownload('narrative')}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-lg shadow-indigo-600/20"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .txt</span>
              </button>
            )}

            {format === 'timestamped' && (
              <button
                type="button"
                onClick={() => handleDownload('timestamped')}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-lg shadow-indigo-600/20"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Script (.txt)</span>
              </button>
            )}

            {format === 'markdown' && (
              <button
                type="button"
                onClick={() => handleDownload('markdown')}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-lg shadow-indigo-600/20"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .md</span>
              </button>
            )}

            {format === 'json' && (
              <button
                type="button"
                onClick={() => handleDownload('json')}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-lg shadow-indigo-600/20"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .json</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
