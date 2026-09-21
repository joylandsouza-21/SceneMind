import './globals.css';
import { Suspense } from 'react';
import Navbar from '@/components/Navbar';
import NavigationProvider, { PageTransitionContent } from '@/components/NavigationProgress';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SceneMind AI | Video Indexing & Semantic Clipping',
  description: 'AI-powered multimodal video indexing, semantic vector search, and frame-accurate sub-clip extraction.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col antialiased selection:bg-blue-500/30 selection:text-blue-200 pt-16">
        <NavigationProvider>
          <Navbar />
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <Suspense fallback={
              <div className="flex items-center justify-center min-h-[40vh]">
                <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              </div>
            }>
              <PageTransitionContent>
                {children}
              </PageTransitionContent>
            </Suspense>
          </main>
          <footer className="border-t border-slate-800/60 py-6 text-center text-xs text-slate-500">
            <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div>SceneMind AI • Multimodal Semantic Video Intelligence Platform</div>
              <div className="flex items-center space-x-4">
                <span>Gemini 2.5 Flash</span>
                <span>•</span>
                <span>FFmpeg 8.1</span>
                <span>•</span>
                <span>Vector Search</span>
              </div>
            </div>
          </footer>
        </NavigationProvider>
      </body>
    </html>
  );
}

