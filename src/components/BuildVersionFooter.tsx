import React from 'react';
import buildInfo from '../buildInfo';

/**
 * Displays build version at the bottom of the page
 * Helps users verify they're on the latest deployment
 */
export default function BuildVersionFooter() {
  return (
    <div className="fixed bottom-0 right-0 text-[10px] text-muted-foreground bg-muted/30 px-3 py-1 rounded-tl-md border-t border-l border-muted-foreground/20 font-mono">
      {buildInfo.version} • {new Date(buildInfo.timestamp).toLocaleDateString()} {new Date(buildInfo.timestamp).toLocaleTimeString()}
    </div>
  );
}
