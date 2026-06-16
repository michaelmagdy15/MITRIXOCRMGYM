import React from 'react';
import { useAuth } from './contexts/AuthContext';
import { ShieldAlert } from 'lucide-react';

// Only these two users may access the quote generator
const QUOTE_GENERATOR_ALLOWED_EMAILS = [
  'magd.gallab@gmail.com',
  'michaelmitry13@gmail.com',
];

export default function QuoteGenerator() {
  const { currentUser } = useAuth();

  const hasAccess =
    currentUser?.email &&
    QUOTE_GENERATOR_ALLOWED_EMAILS.includes(currentUser.email.toLowerCase());

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Access Restricted</h2>
        <p className="text-muted-foreground max-w-sm">
          The Quote Generator is only available to authorized owners.
          Contact your system administrator if you need access.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100vh-120px)] rounded-lg overflow-hidden border border-border shadow-lg">
      <iframe
        src="/quote-generator.html"
        title="mitrixogymcrm Quote Generator"
        className="w-full h-full"
        style={{ border: 'none' }}
        allow="downloads"
      />
    </div>
  );
}
