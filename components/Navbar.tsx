'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Film,
  Search,
  LayoutDashboard,
  FlaskConical,
  Activity,
  BarChart3
} from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const [activeJobCount, setActiveJobCount] = useState(0);
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Clear pending state when pathname changes (navigation completed)
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/events');
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.status === 'processing' || data.status === 'pending') {
            setActiveJobCount((c) => Math.max(1, c));
          } else if (data.status === 'completed' || data.status === 'failed') {
            setActiveJobCount((c) => Math.max(0, c - 1));
          }
        } catch (e) {
          // ignore ping
        }
      };
    } catch (e) {
      console.warn('SSE connection failed:', e);
    }

    // Polling backup
    const checkJobs = async () => {
      try {
        const res = await fetch('/api/jobs');
        if (res.ok) {
          const data = await res.json();
          const active = (data.jobs || []).filter(
            (j: any) => j.status === 'processing' || j.status === 'pending'
          );
          setActiveJobCount(active.length);
        }
      } catch (e) {
        // ignore
      }
    };
    checkJobs();
    const interval = setInterval(checkJobs, 6000);

    return () => {
      if (eventSource) eventSource.close();
      clearInterval(interval);
    };
  }, []);

  const navItems = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/videos', label: 'Videos & Upload', icon: Film },
    { href: '/search', label: 'Global Search', icon: Search },
    { href: '/analytics', label: 'Cost Analytics', icon: BarChart3 },
    { href: '/testing', label: 'Debug & Testbed', icon: FlaskConical },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full border-b border-slate-800/80 bg-[#080c14]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo & Brand */}
        <Link href="/" className="flex items-center space-x-3 group" prefetch={true}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 p-[2px] shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-all">
            <div className="w-full h-full bg-[#080c14] rounded-[10px] flex items-center justify-center">
              <Film className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-lg bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                SceneMind AI
              </span>
              <span className="text-[10px] uppercase font-semibold tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded">
                Studio
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">Video Semantic Indexing & Clipping</p>
          </div>
        </Link>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center space-x-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            const isPending = pendingHref === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onClick={() => {
                  if (!isActive) setPendingHref(item.href);
                }}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm shadow-blue-500/10'
                    : isPending
                    ? 'bg-blue-600/10 text-blue-300 border border-blue-500/20 scale-[0.97]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isPending ? 'animate-pulse' : ''}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Actions & Status */}
        <div className="flex items-center space-x-3">
          {activeJobCount > 0 && (
            <div className="flex items-center space-x-2 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium animate-pulse">
              <Activity className="w-3.5 h-3.5 animate-spin" />
              <span>{activeJobCount} Active Job{activeJobCount > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
