import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Client } from '../../types';
import { storage, getTenantId } from '../../firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { addAuditLog } from '../../services/auditService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Camera, Upload, RefreshCw, Check, X, User, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export interface MemberPhotoCaptureProps {
  client: Client;
  onUpdateClient: (id: string, updates: Partial<Client>) => Promise<void>;
  onPhotoSaved?: (photoURL: string) => void;
  size?: 'sm' | 'md' | 'lg';
  showMissingAlert?: boolean;
  staffName?: string;
}

export const MemberPhotoCapture: React.FC<MemberPhotoCaptureProps> = ({
  client,
  onUpdateClient,
  onPhotoSaved,
  size = 'md',
  showMissingAlert = false,
  staffName = 'Staff',
}) => {
  const [isWebcamOpen, setIsWebcamOpen] = useState(false);
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [imgLoadFailed, setImgLoadFailed] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const rawPhotoCandidate = String(
    client.photoURL ||
      (client as any).photoUrl ||
      (client as any).avatar ||
      ''
  ).trim();

  // Filter out broken RedGITS directory-only placeholder URLs ("https://inzan.redgits.com/uploads/")
  // and fall back to the RedGITS member webcam path when redgitsId is available.
  const isBrokenUploadsRoot = /\/uploads\/?$/i.test(rawPhotoCandidate);
  const fallbackRedgitsId =
    (client as any).redgitsId ||
    (client.id && String(client.id).startsWith('redgits-') ? String(client.id).replace(/^redgits-/, '') : '');
  const resolvedPhotoUrl =
    rawPhotoCandidate && !isBrokenUploadsRoot
      ? rawPhotoCandidate
      : fallbackRedgitsId && /^\d+$/.test(String(fallbackRedgitsId))
      ? `https://inzan.redgits.com/uploads/members/${fallbackRedgitsId}-cam.jpg`
      : '';

  const currentPhoto = imgLoadFailed ? '' : resolvedPhotoUrl;

  const stopWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, [stopWebcam]);

  // Reset webcam when switching between members
  useEffect(() => {
    stopWebcam();
    setIsWebcamOpen(false);
    setCapturedDataUrl(null);
    setCameraError(null);
    setImgLoadFailed(false);
  }, [client.id, resolvedPhotoUrl, stopWebcam]);

  const startWebcam = async () => {
    setCameraError(null);
    setCapturedDataUrl(null);
    setIsWebcamOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 640 },
          facingMode: 'user',
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.error('Failed to access webcam:', err);
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access in your browser or use Upload Photo.'
          : 'Could not start webcam. Check if another app is using the camera or use Upload Photo.'
      );
    }
  };

  const handleSnapFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    const vw = video.videoWidth || 480;
    const vh = video.videoHeight || 480;
    const side = Math.min(vw, vh);
    const sx = Math.floor((vw - side) / 2);
    const sy = Math.floor((vh - side) / 2);

    const canvas = document.createElement('canvas');
    const targetSize = 360;
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, sx, sy, side, side, 0, 0, targetSize, targetSize);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    setCapturedDataUrl(dataUrl);
    stopWebcam();
  };

  const compressImageFileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const side = Math.min(img.width, img.height);
          const sx = Math.floor((img.width - side) / 2);
          const sy = Math.floor((img.height - side) / 2);
          const canvas = document.createElement('canvas');
          const targetSize = 360;
          canvas.width = targetSize;
          canvas.height = targetSize;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(String(reader.result));
            return;
          }
          ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = reject;
        img.src = String(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const savePhotoDataUrl = async (dataUrl: string) => {
    setIsSaving(true);
    try {
      let finalUrl = dataUrl;
      // Attempt Firebase Storage upload first, with automatic compressed dataUrl fallback
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const fileRef = storageRef(
          storage,
          `tenants/${getTenantId()}/member_photos/${client.id}_${Date.now()}.jpg`
        );
        await uploadBytes(fileRef, blob, { contentType: 'image/jpeg' });
        finalUrl = await getDownloadURL(fileRef);
      } catch {
        // Fallback to compact 360x360 JPEG dataURL (~20KB) so it always succeeds
        finalUrl = dataUrl;
      }

      await onUpdateClient(client.id, { photoURL: finalUrl });
      await addAuditLog(
        'UPDATE',
        'CLIENT',
        client.id,
        `Updated member profile photo for ${client.name} (#${client.memberId || client.id})`,
        staffName
      );
      if (onPhotoSaved) {
        onPhotoSaved(finalUrl);
      }
      setCapturedDataUrl(null);
      setIsWebcamOpen(false);
      toast.success(`Profile photo saved for ${client.name}!`);
    } catch (err: any) {
      console.error('Failed to save member photo:', err);
      toast.error(err?.message || 'Failed to save member photo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageFileToDataUrl(file);
      await savePhotoDataUrl(dataUrl);
    } catch {
      toast.error('Could not process selected image file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const avatarDims =
    size === 'lg' ? 'h-20 w-20' : size === 'sm' ? 'h-12 w-12' : 'h-16 w-16';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        {/* Avatar Preview */}
        <div
          className={`relative ${avatarDims} rounded-2xl overflow-hidden border-2 ${
            currentPhoto
              ? 'border-emerald-500/50 bg-muted'
              : 'border-dashed border-amber-500/60 bg-amber-500/10'
          } flex items-center justify-center shrink-0 shadow-sm`}
        >
          {currentPhoto ? (
            <img
              src={currentPhoto}
              alt={client.name}
              className="h-full w-full object-cover"
              onError={() => setImgLoadFailed(true)}
            />
          ) : (
            <User className="h-7 w-7 text-amber-500/80" />
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-col gap-1.5">
          {!currentPhoto && showMissingAlert && (
            <Badge
              variant="outline"
              className="w-fit text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 gap-1"
            >
              <AlertTriangle className="h-3 w-3" />
              No Member Photo — Capture at Reception
            </Badge>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={currentPhoto ? 'outline' : 'default'}
              disabled={isSaving}
              onClick={() => {
                if (isWebcamOpen) {
                  stopWebcam();
                  setIsWebcamOpen(false);
                  setCapturedDataUrl(null);
                } else {
                  startWebcam();
                }
              }}
              className={`h-7 px-2.5 text-xs font-bold gap-1.5 ${
                !currentPhoto
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : ''
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              {isWebcamOpen
                ? 'Close Webcam'
                : currentPhoto
                ? 'Retake Webcam Photo'
                : 'Take Webcam Photo'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isSaving}
              onClick={() => fileInputRef.current?.click()}
              className="h-7 px-2.5 text-xs font-bold gap-1.5"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Photo
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </div>

      {/* Inline Webcam Capture Modal / Drawer */}
      {isWebcamOpen && (
        <div className="p-3 rounded-xl border-2 border-primary/30 bg-background/95 shadow-lg space-y-2.5 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Camera className="h-3.5 w-3.5" />
              Webcam Photo Capture — {client.name}
            </span>
            <button
              type="button"
              onClick={() => {
                stopWebcam();
                setIsWebcamOpen(false);
                setCapturedDataUrl(null);
              }}
              className="text-xs text-muted-foreground hover:text-foreground font-bold"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {cameraError ? (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive space-y-2">
              <p className="font-semibold">{cameraError}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="h-7 text-xs font-bold gap-1"
              >
                <Upload className="h-3 w-3" /> Choose Photo File Instead
              </Button>
            </div>
          ) : capturedDataUrl ? (
            <div className="flex flex-col items-center gap-2.5">
              <img
                src={capturedDataUrl}
                alt="Captured preview"
                className="h-44 w-44 rounded-2xl object-cover border-2 border-emerald-500 shadow-md"
              />
              <div className="flex items-center gap-2 w-full justify-center">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isSaving}
                  onClick={startWebcam}
                  className="h-8 text-xs font-bold gap-1"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retake
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => savePhotoDataUrl(capturedDataUrl)}
                  className="h-8 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" />
                  {isSaving ? 'Saving Photo...' : 'Save Member Photo'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2.5">
              <div className="relative h-44 w-44 rounded-2xl overflow-hidden bg-black border-2 border-primary/40 shadow-inner">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover scale-x-[-1]"
                />
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleSnapFrame}
                className="h-8 px-5 text-xs font-bold bg-primary text-primary-foreground gap-1.5"
              >
                <Camera className="h-3.5 w-3.5" />
                Snap Photo
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MemberPhotoCapture;
