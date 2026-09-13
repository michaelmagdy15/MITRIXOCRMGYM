import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HelpPage() {
  const goBack = () => {
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

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
      <iframe
        src="/help-guide.html"
        className="flex-1 w-full border-0"
        title="CRM Help Guide"
      />
    </div>
  );
}
