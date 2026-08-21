const MAX_PX = 400;
const TARGET_KB = 150;
const MIN_QUALITY = 0.30;

export async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > MAX_PX || height > MAX_PX) {
        if (width > height) {
          height = Math.round((height / width) * MAX_PX);
          width = MAX_PX;
        } else {
          width = Math.round((width / height) * MAX_PX);
          height = MAX_PX;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
      } else {
          reject(new Error('Canvas 2d context not available'));
          return;
      }

      const tryCompress = (quality: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas toBlob failed'));
              return;
            }
            if (blob.size / 1024 <= TARGET_KB || quality <= MIN_QUALITY) {
              resolve(blob);
            } else {
              tryCompress(Math.max(MIN_QUALITY, quality - 0.15));
            }
          },
          'image/jpeg',
          quality
        );
      };

      tryCompress(0.75);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    img.src = objectUrl;
  });
}
