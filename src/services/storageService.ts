export interface UploadTenantAssetOptions {
  contentType?: string;
  kind?: 'avatar' | 'banner' | 'document';
  fileName?: string;
}

/**
 * Returns true strictly for migrated Spark projects without Blaze Firebase Storage buckets.
 * Strike (`strike-production-f5242.firebasestorage.app`) and other standard tenants return false.
 */
export function isSparkStoragelessBucket(bucket?: string | null): boolean {
  const b = String(bucket || '').trim();
  if (!b) return false;
  return /^(inzan-crm-spark-26|vbt-camp-spark-26)\./i.test(b);
}

function detectBrowserTenantId(): string {
  try {
    if (typeof window === 'undefined') return '';
    const injected = String((window as any).__FIREBASE_CONFIG__?.tenantId || '').trim();
    if (injected) return injected;
    const host = String(window.location?.hostname || '').toLowerCase();
    if (host.includes('inzanathletics') || host.includes('inzan')) return 'inzanathletics';
    if (host.includes('strike-egy') || host.includes('strikeboxing') || host.startsWith('strike.')) return 'strike';
  } catch {
    // ignore non-browser env
  }
  return '';
}

function sanitizeLocalPhotoFile(photoLocal?: string | null): string {
  const raw = String(photoLocal || '').trim();
  if (!raw) return '';
  const basename = raw.split('/').pop()?.trim() || '';
  if (!basename || basename === '.' || basename === '..') return '';
  return basename;
}

/**
 * Resolves a member's photo URL cleanly:
 * - Treats broken RedGITS directory-only placeholder (`https://inzan.redgits.com/uploads/`) as empty.
 * - Falls back to `/member-photos/<photoLocal>` ONLY for Inzan tenants.
 */
export function resolveMemberPhotoUrl(
  photoURL?: string | null,
  photoLocal?: string | null,
  tenantId?: string
): string {
  const candidate = String(photoURL || '').trim();
  const isBrokenDirectoryPlaceholder = /\/uploads\/?$/i.test(candidate);
  if (candidate && !isBrokenDirectoryPlaceholder) {
    return candidate;
  }

  const effectiveTenant = String(tenantId ?? detectBrowserTenantId()).toLowerCase();
  if (!effectiveTenant.includes('inzan')) {
    return '';
  }

  const localFile = sanitizeLocalPhotoFile(photoLocal);
  return localFile ? `/member-photos/${encodeURIComponent(localFile)}` : '';
}

/**
 * Computes an `onError` CDN fallback URL (`/member-photos/...`) when a legacy RedGITS photo URL
 * fails to load or when `photoLocal` is available. Returns `null` if no fallback exists.
 */
export function getMemberPhotoFallbackUrl(
  photoURL?: string | null,
  photoLocal?: string | null
): string | null {
  const current = String(photoURL || '').trim();
  const localFile = sanitizeLocalPhotoFile(photoLocal);
  if (localFile) {
    const candidate = `/member-photos/${encodeURIComponent(localFile)}`;
    if (current !== candidate) return candidate;
  }

  if (current && !current.startsWith('/member-photos/')) {
    const match = current.match(/inzan\.redgits\.com\/uploads\/members\/([^/?#]+)/i);
    if (match?.[1]) {
      return `/member-photos/${encodeURIComponent(match[1])}`;
    }
  }
  return null;
}

async function compressAvatarToDataUrl(blob: Blob, targetSize = 280, quality = 0.78): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('Canvas avatar compression requires a browser environment.');
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode avatar image.'));
      el.src = objectUrl;
    });
    const side = Math.min(img.width || targetSize, img.height || targetSize);
    const sx = Math.max(0, Math.floor(((img.width || side) - side) / 2));
    const sy = Math.max(0, Math.floor(((img.height || side) - side) / 2));
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function resizeImageForSparkStorage(blob: Blob, maxDim = 1200, quality = 0.78): Promise<{ blob: Blob; contentType: string }> {
  if (typeof document === 'undefined' || !blob.type.startsWith('image/')) {
    return { blob, contentType: blob.type || 'application/octet-stream' };
  }
  if (blob.size <= 250 * 1024) {
    return { blob, contentType: blob.type || 'image/jpeg' };
  }
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode uploaded image.'));
      el.src = objectUrl;
    });
    const w = img.width || maxDim;
    const h = img.height || maxDim;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return { blob, contentType: blob.type || 'image/jpeg' };
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const resized = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((out) => resolve(out), 'image/jpeg', quality)
    );
    if (resized && resized.size < blob.size) {
      return { blob: resized, contentType: 'image/jpeg' };
    }
    return { blob, contentType: blob.type || 'image/jpeg' };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function blobToBase64Only(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Uploads a tenant file or image cleanly:
 * - Standard Firebase Storage tenants (including Strike) use `firebase/storage` (`uploadBytes` + `getDownloadURL`).
 * - Spark storageless tenants (`inzan-crm-spark-26`, `vbt-camp-spark-26`) store compact avatars inline as
 *   ~15 KB JPEG data URLs or upload images/PDFs (`<= 700 KB`) via `/api/storage/upload` -> `/api/storage/file/<id>`.
 */
export async function uploadTenantAsset(
  storagePath: string,
  fileOrBlob: Blob | File,
  options?: UploadTenantAssetOptions
): Promise<string> {
  const { auth, storage } = await import('../firebase');
  const bucket = storage?.app?.options?.storageBucket || '';
  const requestedType = options?.contentType || fileOrBlob.type || 'application/octet-stream';

  if (!isSparkStoragelessBucket(bucket)) {
    const { ref: storageRef, uploadBytes, getDownloadURL } = await import('firebase/storage');
    const fileRef = storageRef(storage, storagePath);
    await uploadBytes(fileRef, fileOrBlob, { contentType: requestedType });
    return await getDownloadURL(fileRef);
  }

  const isAvatar =
    options?.kind === 'avatar' || /(^|\/)(member_photos|avatars)\//i.test(storagePath);

  if (isAvatar && typeof document !== 'undefined') {
    return await compressAvatarToDataUrl(fileOrBlob, 280, 0.78);
  }

  const prepared = await resizeImageForSparkStorage(fileOrBlob, 1200, 0.78);
  const dataBase64 = await blobToBase64Only(prepared.blob);
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error('Authentication required to upload files.');
  }

  const rawName =
    options?.fileName ||
    ((fileOrBlob as File)?.name ? String((fileOrBlob as File).name) : storagePath.split('/').pop()) ||
    'upload';

  const res = await fetch('/api/storage/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      dataBase64,
      contentType: prepared.contentType || requestedType,
      fileName: rawName,
      category: options?.kind || 'document',
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.url) {
    throw new Error(payload?.error || `Upload failed with status ${res.status}`);
  }
  return String(payload.url);
}
