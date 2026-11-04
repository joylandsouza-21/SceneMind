'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Trash2, X, AlertOctagon, RotateCcw, RefreshCw, Square, Info } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  iconType?: 'trash' | 'stop' | 'warning' | 'refresh';
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText,
  cancelText = 'Cancel',
  variant = 'warning',
  iconType,
}: ConfirmModalProps) {
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Close on Escape, confirm on Enter
  useEffect(() => {
    if (!isOpen) {
      setIsActionLoading(false);
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleConfirmClick = async () => {
    try {
      setIsActionLoading(true);
      await onConfirm();
    } finally {
      setIsActionLoading(false);
    }
  };

  // Determine icon & styling themes
  const effectiveIcon = iconType || (variant === 'danger' ? 'trash' : variant === 'warning' ? 'warning' : 'refresh');

  const themeConfig = {
    danger: {
      badgeBg: 'bg-red-500/15 border-red-500/30 text-red-400',
      glow: 'shadow-red-500/20',
      btnBg: 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-lg shadow-red-500/25',
      defaultConfirmText: 'Delete Video',
    },
    warning: {
      badgeBg: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
      glow: 'shadow-amber-500/20',
      btnBg: 'bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-500/25',
      defaultConfirmText: 'Yes, Stop Processing',
    },
    info: {
      badgeBg: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
      glow: 'shadow-blue-500/20',
      btnBg: 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-500/25',
      defaultConfirmText: 'Proceed',
    },
  }[variant];

  const renderIcon = () => {
    switch (effectiveIcon) {
      case 'trash':
        return <Trash2 className="w-6 h-6" />;
      case 'stop':
        return <Square className="w-5 h-5 fill-current" />;
      case 'refresh':
        return <RotateCcw className="w-5 h-5" />;
      case 'warning':
      default:
        return <AlertTriangle className="w-6 h-6" />;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isActionLoading) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className={`p-3 rounded-2xl border ${themeConfig.badgeBg} shadow-lg ${themeConfig.glow} shrink-0`}>
              {renderIcon()}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isActionLoading}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <h3 className="text-lg font-bold text-white tracking-tight">
              {title}
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {message}
            </p>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="p-6 pt-3 bg-slate-950/40 border-t border-slate-800/80 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isActionLoading}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 transition-all disabled:opacity-50 active:scale-95"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={isActionLoading}
            className={`px-5 py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center space-x-2 active:scale-95 disabled:opacity-50 ${themeConfig.btnBg}`}
          >
            {isActionLoading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <span>{confirmText || themeConfig.defaultConfirmText}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
