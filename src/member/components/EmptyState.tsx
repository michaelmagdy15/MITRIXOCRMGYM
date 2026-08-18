import React from 'react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, actionLabel, onAction, compact }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-12'}`}>
      {icon && (
        <div className="bg-primary/5 p-4 rounded-full mb-3 border border-primary/10">
          <div className="text-muted-foreground/70">{icon}</div>
        </div>
      )}
      <p className="font-semibold text-sm text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground max-w-[260px] mt-1.5 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-4 h-10 text-xs font-bold rounded-xl px-5">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}