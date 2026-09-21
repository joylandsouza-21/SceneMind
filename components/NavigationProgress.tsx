'use client';

import React, { useEffect, useState, createContext, useContext } from 'react';
import { usePathname } from 'next/navigation';

interface TransitionContextType {
  isNavigating: boolean;
}

const TransitionContext = createContext<TransitionContextType>({ isNavigating: false });

export function usePageTransition() {
  return useContext(TransitionContext);
}

/**
 * Wraps page content with smooth opacity-only fade transitions on route changes.
 * No translateY — purely opacity to avoid any visual shaking.
 */
export default function PageTransitionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [displayedChildren, setDisplayedChildren] = useState(children);
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showBar, setShowBar] = useState(false);
  const [opacity, setOpacity] = useState(1);

  // When pathname changes, trigger a smooth opacity-only transition
  useEffect(() => {
    setOpacity(0.4);
    setIsNavigating(true);
    setShowBar(true);
    setProgress(30);

    let current = 30;
    const progressInterval = setInterval(() => {
      current += Math.random() * 12;
      if (current >= 85) {
        current = 85;
        clearInterval(progressInterval);
      }
      setProgress(current);
    }, 100);

    const swapTimer = setTimeout(() => {
      setDisplayedChildren(children);
      setOpacity(1);
      setProgress(100);
      clearInterval(progressInterval);

      setTimeout(() => {
        setIsNavigating(false);
        setShowBar(false);
        setProgress(0);
      }, 300);
    }, 120);

    return () => {
      clearTimeout(swapTimer);
      clearInterval(progressInterval);
    };
  }, [pathname]);

  // Update children for same-page data changes (no animation)
  useEffect(() => {
    if (!isNavigating) {
      setDisplayedChildren(children);
    }
  }, [children]);

  return (
    <TransitionContext.Provider value={{ isNavigating }}>
      {/* Top progress bar */}
      {showBar && (
        <div className="fixed top-0 left-0 right-0 z-[100] pointer-events-none">
          <div
            className="h-[2.5px] bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500"
            style={{
              width: `${progress}%`,
              transition: progress === 100 ? 'width 200ms ease-out' : 'width 400ms ease-out',
              boxShadow: '0 0 12px rgba(59,130,246,0.6)',
            }}
          />
        </div>
      )}

      {/* Page content — opacity only, no movement */}
      <div
        style={{
          opacity,
          transition: 'opacity 150ms ease-in-out',
        }}
      >
        {displayedChildren}
      </div>
    </TransitionContext.Provider>
  );
}
