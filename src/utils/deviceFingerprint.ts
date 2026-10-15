/**
 * Clean-room Reception & Staff Device Fingerprinting Utility
 * Inspired by RedGITS v17.12 `BlockIntel` hardware/browser station telemetry.
 * Binds reception check-ins and sensitive staff actions to an identifiable workstation fingerprint.
 */

export interface DeviceFingerprintPayload {
  fingerprintId: string;
  userAgent: string;
  language: string;
  platform: string;
  hardwareConcurrency: number;
  deviceMemory: number | null;
  screenResolution: string;
  colorDepth: number;
  pixelRatio: number;
  timezone: string;
  webglRenderer: string;
  canvasSignature: string;
  collectedAt: string;
}

const STORAGE_KEY = 'mitrixo_device_fingerprint_v1';

function fnv1aHash(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function getWebglRendererInfo(): string {
  try {
    if (typeof document === 'undefined') return 'ssr';
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return 'no-webgl';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return gl.getParameter(gl.RENDERER) || 'webgl-standard';
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
    return `${vendor}::${renderer}`;
  } catch {
    return 'webgl-blocked';
  }
}

function getCanvasSignature(): string {
  try {
    if (typeof document === 'undefined') return 'ssr';
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-2d';
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(10, 4, 60, 20);
    ctx.fillStyle = '#0f172a';
    ctx.fillText('MitrixoGYM-Station', 8, 10);
    return fnv1aHash(canvas.toDataURL());
  } catch {
    return 'canvas-blocked';
  }
}

export function collectDeviceFingerprint(): DeviceFingerprintPayload {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      fingerprintId: 'server-node',
      userAgent: 'server',
      language: 'en',
      platform: 'server',
      hardwareConcurrency: 1,
      deviceMemory: null,
      screenResolution: '0x0',
      colorDepth: 24,
      pixelRatio: 1,
      timezone: 'Africa/Cairo',
      webglRenderer: 'ssr',
      canvasSignature: 'ssr',
      collectedAt: new Date().toISOString(),
    };
  }

  const userAgent = navigator.userAgent || '';
  const language = navigator.language || 'en';
  const platform = navigator.platform || 'unknown';
  const hardwareConcurrency = navigator.hardwareConcurrency || 0;
  const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null;
  const screenResolution =
    typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '0x0';
  const colorDepth = typeof screen !== 'undefined' ? screen.colorDepth || 24 : 24;
  const pixelRatio = window.devicePixelRatio || 1;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo';
  const webglRenderer = getWebglRendererInfo();
  const canvasSignature = getCanvasSignature();

  const rawComposite = [
    userAgent,
    platform,
    hardwareConcurrency,
    deviceMemory,
    screenResolution,
    colorDepth,
    pixelRatio,
    timezone,
    webglRenderer,
    canvasSignature,
  ].join('|');

  const fingerprintId = `STN-${fnv1aHash(rawComposite).toUpperCase()}`;

  const payload: DeviceFingerprintPayload = {
    fingerprintId,
    userAgent,
    language,
    platform,
    hardwareConcurrency,
    deviceMemory,
    screenResolution,
    colorDepth,
    pixelRatio,
    timezone,
    webglRenderer,
    canvasSignature,
    collectedAt: new Date().toISOString(),
  };

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage quota errors
  }

  return payload;
}

export function getCachedDeviceFingerprint(): DeviceFingerprintPayload {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const cached = sessionStorage.getItem(STORAGE_KEY);
      if (cached) {
        return JSON.parse(cached) as DeviceFingerprintPayload;
      }
    }
  } catch {
    // fallback to fresh collection
  }
  return collectDeviceFingerprint();
}
