import React from 'react';
import buildInfo from '../buildInfo';

/**
 * Displays system release version and last update date at the bottom of the page.
 * Displays fixed release date rather than dynamic clock time.
 */
export default function BuildVersionFooter() {
  return (
    <div
      className="hidden md:block fixed bottom-0 right-0 text-[10px] text-muted-foreground bg-muted/40 backdrop-blur-sm px-3 py-1 rounded-tl-md border-t border-l border-muted-foreground/20 font-mono z-40 select-none shadow-sm"
      title={`System Version ${buildInfo.systemVersion} • Commit ${buildInfo.commit} • Released ${buildInfo.lastUpdated}`}
    >
      <span className="font-semibold text-foreground/80">System v{buildInfo.systemVersion}</span>
      <span className="mx-1.5 opacity-50">•</span>
      <span>Last Updated: {buildInfo.lastUpdated}</span>
    </div>
  );
}
