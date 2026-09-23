import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useAppContext } from './context';
import { getTenantId } from './firebase';
import { ShieldAlert, Loader2 } from 'lucide-react';

// Authorized emails who have direct owner access across all tenants
const QUOTE_GENERATOR_ALLOWED_EMAILS = [
  'magd.gallab@gmail.com',
  'michaelmitry13@gmail.com',
  'simary@inzan.com',
];

export default function QuoteGenerator() {
  const { currentUser: authUser } = useAuth();
  const { branding, branches, effectiveRole, currentUser } = useAppContext();
  const tenantId = getTenantId();
  const isInzan = tenantId === 'inzanathletics' || tenantId === 'inzan';

  const userEmail = (authUser?.email || currentUser?.email || '').toLowerCase();
  const isAuthorizedEmail =
    QUOTE_GENERATOR_ALLOWED_EMAILS.some(email => userEmail === email.toLowerCase()) ||
    userEmail.endsWith('@inzan.com') ||
    userEmail.includes('inzan');
  const isAdminRole =
    effectiveRole === 'admin' ||
    effectiveRole === 'crm_admin' ||
    effectiveRole === 'super_admin' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'crm_admin';

  const hasAccess = Boolean(isAuthorizedEmail || isAdminRole);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [loadingHtml, setLoadingHtml] = useState(true);

  const companyName = branding?.companyName || (isInzan ? 'INZAN ATHLETICS' : 'STRIKE');
  // For dark header/doc-header bars, use crisp white logos:
  const logoUrl = isInzan ? '/inzanlogo_white.png' : (branding?.logoUrl || '/strikelogo_white.png');
  const currencyCode = branding?.currencyCode || 'EGP';
  const currencySymbol = branding?.currencySymbol || 'LE';
  const defaultBranch = branches?.[0] || (isInzan ? 'Garden 8' : 'Maxim Compound');

  const queryParams = new URLSearchParams({
    tenant: tenantId,
    company: companyName,
    logo: logoUrl,
    currency: currencyCode,
    currencySymbol: currencySymbol,
    branch: defaultBranch,
  });

  const iframeSrc = `/quote-generator.html?${queryParams.toString()}`;

  useEffect(() => {
    let active = true;

    async function loadQuoteHtml() {
      try {
        setLoadingHtml(true);
        // Direct fetch avoids ServiceWorker navigation interception
        const res = await fetch(`/quote-generator.html?cb=${Date.now()}`);
        if (!res.ok) {
          throw new Error(`Failed to load quote generator: ${res.status}`);
        }
        let html = await res.text();

        // Inject the tenant context directly so it executes immediately on iframe parse
        const injectedContext = {
          tenant: isInzan ? 'inzanathletics' : 'strike',
          isInzan,
          companyName,
          logoUrl,
          currency: currencyCode,
          currencySymbol,
          branch: defaultBranch,
          prefix: isInzan ? 'INZ-' : 'STR-',
          filePrefix: isInzan ? 'INZAN_ATHLETICS' : 'STRIKE'
        };

        const scriptTag = `<script>window.__INJECTED_TENANT__ = ${JSON.stringify(injectedContext)};</script>`;
        if (html.includes('<head>')) {
          html = html.replace('<head>', `<head>\n  ${scriptTag}`);
        } else {
          html = `${scriptTag}\n${html}`;
        }

        if (active) {
          setSrcDoc(html);
          setLoadingHtml(false);
        }
      } catch (err) {
        console.error('[QuoteGenerator] Error loading quote-generator.html via srcDoc:', err);
        if (active) {
          setLoadingHtml(false);
        }
      }
    }

    if (hasAccess) {
      loadQuoteHtml();
    }

    return () => {
      active = false;
    };
  }, [hasAccess, isInzan, companyName, logoUrl, currencyCode, currencySymbol, defaultBranch]);

  const handleIframeLoad = () => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: 'SET_TENANT_BRANDING',
          tenantId,
          companyName,
          logoUrl,
          currencyCode,
          currencySymbol,
          defaultBranch,
          isInzan,
        },
        '*'
      );
    } catch {}
  };

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Access Restricted</h2>
        <p className="text-muted-foreground max-w-sm">
          The Quote Generator is only available to authorized gym staff and administrators.
          Contact your system administrator if you need access.
        </p>
      </div>
    );
  }

  if (loadingHtml) {
    return (
      <div className="w-full h-[calc(100vh-120px)] rounded-lg overflow-hidden border border-border shadow-lg flex items-center justify-center bg-card">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Loading {companyName} Quote Builder...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100vh-120px)] rounded-lg overflow-hidden border border-border shadow-lg">
      <iframe
        ref={iframeRef}
        srcDoc={srcDoc || undefined}
        src={!srcDoc ? iframeSrc : undefined}
        onLoad={handleIframeLoad}
        title={`${companyName} Quote Generator`}
        className="w-full h-full"
        style={{ border: 'none' }}
        allow="downloads"
      />
    </div>
  );
}
