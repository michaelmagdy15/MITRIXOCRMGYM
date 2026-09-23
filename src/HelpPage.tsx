import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HelpPage() {
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const goBack = () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  useEffect(() => {
    let active = true;
    async function fetchHelp() {
      try {
        const res = await fetch(`/help-guide.html?cb=${Date.now()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        if (active) {
          setSrcDoc(html);
          setLoading(false);
        }
      } catch (err) {
        console.error('[HelpPage] Failed to fetch help-guide.html:', err);
        if (active) {
          setLoading(false);
        }
      }
    }
    fetchHelp();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Thin header bar */}
      <div className="flex items-center justify-between px-4 h-11 bg-card border-b shrink-0">
        <span className="text-sm font-semibold text-muted-foreground tracking-wide">
          Help Guide — Strike Boxing CRM v2.1
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={goBack}
          title="Close help"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Full-height iframe */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <iframe
          srcDoc={srcDoc || undefined}
          src={!srcDoc ? '/help-guide.html' : undefined}
          className="flex-1 w-full border-0"
          title="CRM Help Guide"
        />
      )}
    </div>
  );
}
