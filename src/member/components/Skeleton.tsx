import React from 'react';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className = '', style }: SkeletonProps) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden="true" />;
}

export function SkeletonText({ width = '100%', className = '' }: { width?: string; className?: string }) {
  return <Skeleton className={`h-3 ${className}`} style={{ width }} />;
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-2xl border bg-card/50 p-4 space-y-3 ${className}`} aria-hidden="true">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-6 rounded-lg" />
      </div>
      <Skeleton className="h-6 w-16" />
      <SkeletonText width="70%" className="mt-1" />
    </div>
  );
}

export function MemberScreenSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading" role="status">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>
      <Skeleton className="h-[190px] rounded-[24px]" />
      <div className="grid grid-cols-2 gap-3">
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-20 rounded-2xl" />
        <Skeleton className="h-20 rounded-2xl" />
      </div>
      <span className="sr-only">Loading your member portal…</span>
    </div>
  );
}