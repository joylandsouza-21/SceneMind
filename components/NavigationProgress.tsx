'use client';

import React, {
  useEffect,
  useState,
  createContext,
  useContext,
  useCallback,
  useRef,
} from 'react';
import { usePathname } from 'next/navigation';
import { PageLoadingSkeleton } from '@/components/LoadingSkeleton';

/* ------------------------------------------------------------------ */
/* Types & Helpers                                                    */
/* ------------------------------------------------------------------ */
interface NavigationContextType {
  isNavigating: boolean;
  navigatingTo: string | null;
  targetTitle: string | null;
  effectivePath: string;
  startNavigation: (href: string, title?: string) => void;
}

const NavigationContext = createContext<NavigationContextType>({
  isNavigating: false,
  navigatingTo: null,
  targetTitle: null,
  effectivePath: '/',
  startNavigation: () => {},
});

export function useNavigation() {
  return useContext(NavigationContext);
}

/** Legacy hook support */
export function usePageTransition() {
  const { isNavigating } = useContext(NavigationContext);
  return { isNavigating };
}

export function getRouteTitle(href: string): string {
  const clean = href.split('?')[0].split('#')[0];
  if (clean === '/' || clean === '') return 'Dashboard';
  if (clean.startsWith('/videos/') && clean !== '/videos') return 'Video Analysis';
  if (clean.startsWith('/videos')) return 'Videos & Upload';
  if (clean.startsWith('/search')) return 'Global Search';
  if (clean.startsWith('/analytics')) return 'Cost Analytics';
  return 'Loading';
}

/* ------------------------------------------------------------------ */
/* Navigation Provider                                                */
/* ------------------------------------------------------------------ */
export default function NavigationProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null);
  const [targetTitle, setTargetTitle] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showBar, setShowBar] = useState(false);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const clearProgressInterval = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const startNavigation = useCallback((href: string, title?: string) => {
    const cleanHref = href.split('?')[0].split('#')[0];

    // Avoid self-navigation triggering loading state
    if (cleanHref === pathname) {
      return;
    }

    const determinedTitle = title || getRouteTitle(cleanHref);
    setNavigatingTo(cleanHref);
    setTargetTitle(determinedTitle);
    setIsNavigating(true);
    setShowBar(true);
    setProgress(35);

    clearProgressInterval();
    let curr = 35;
    progressIntervalRef.current = setInterval(() => {
      curr += Math.random() * 10;
      if (curr >= 88) {
        curr = 88;
        clearProgressInterval();
      }
      setProgress(curr);
    }, 120);
  }, [pathname]);

  // When pathname changes (navigation completed by Next.js router)
  useEffect(() => {
    clearProgressInterval();
    setProgress(100);

    const timer = setTimeout(() => {
      setIsNavigating(false);
      setNavigatingTo(null);
      setTargetTitle(null);
      setShowBar(false);
      setProgress(0);
    }, 150);

    return () => {
      clearTimeout(timer);
      clearProgressInterval();
    };
  }, [pathname]);

  // Safety fallback: if navigation takes > 8 seconds, recover UI
  useEffect(() => {
    if (!isNavigating) return;
    const safetyTimer = setTimeout(() => {
      clearProgressInterval();
      setIsNavigating(false);
      setNavigatingTo(null);
      setTargetTitle(null);
      setShowBar(false);
      setProgress(0);
    }, 8000);

    return () => clearTimeout(safetyTimer);
  }, [isNavigating]);

  // Global click listener to instantly switch on any internal link click
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      if (
        e.button !== 0 ||
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest('a');
      if (!anchor) return;

      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const rawHref = anchor.getAttribute('href');
      if (
        !rawHref ||
        rawHref.startsWith('#') ||
        rawHref.startsWith('mailto:') ||
        rawHref.startsWith('tel:') ||
        rawHref.startsWith('javascript:')
      ) {
        return;
      }

      // Check if internal origin/path
      if (rawHref.startsWith('/') || rawHref.startsWith(window.location.origin)) {
        try {
          const targetUrl = new URL(rawHref, window.location.origin);
          if (targetUrl.origin === window.location.origin) {
            const cleanTarget = targetUrl.pathname;
            if (cleanTarget !== pathname) {
              startNavigation(cleanTarget, getRouteTitle(cleanTarget));
            }
          }
        } catch {
          // ignore invalid URLs
        }
      }
    };

    const handlePopState = () => {
      const targetPath = window.location.pathname;
      if (targetPath !== pathname) {
        startNavigation(targetPath, getRouteTitle(targetPath));
      }
    };

    document.addEventListener('click', handleGlobalClick, true);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleGlobalClick, true);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [pathname, startNavigation]);

  const effectivePath = navigatingTo || pathname;

  return (
    <NavigationContext.Provider
      value={{
        isNavigating,
        navigatingTo,
        targetTitle,
        effectivePath,
        startNavigation,
      }}
    >
      {/* Top progress bar */}
      {showBar && (
        <div className="fixed top-0 left-0 right-0 z-[100] pointer-events-none">
          <div
            className="h-[2.5px] bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500"
            style={{
              width: `${progress}%`,
              transition: progress === 100 ? 'width 150ms ease-out' : 'width 300ms ease-out',
              boxShadow: '0 0 12px rgba(59,130,246,0.8)',
            }}
          />
        </div>
      )}

      {children}
    </NavigationContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Page Transition Content Wrapper                                    */
/* ------------------------------------------------------------------ */
export function PageTransitionContent({ children }: { children: React.ReactNode }) {
  const { isNavigating, navigatingTo, targetTitle } = useNavigation();

  // If navigating to another page, instantly switch out the previous page and show loader
  if (isNavigating && navigatingTo) {
    return (
      <div className="animate-in fade-in duration-150">
        <PageLoadingSkeleton title={targetTitle || getRouteTitle(navigatingTo)} />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-150">
      {children}
    </div>
  );
}
