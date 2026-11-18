import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSparkStoragelessBucket,
  resolveMemberPhotoUrl,
  getMemberPhotoFallbackUrl,
} from './storageService.ts';

describe('storageService Spark routing & member CDN photo helpers', () => {
  it('identifies Spark storageless buckets without touching Strike', () => {
    assert.strictEqual(
      isSparkStoragelessBucket('strike-production-f5242.firebasestorage.app'),
      false
    );
    assert.strictEqual(
      isSparkStoragelessBucket('inzan-crm-spark-26.firebasestorage.app'),
      true
    );
    assert.strictEqual(
      isSparkStoragelessBucket('vbt-camp-spark-26.firebasestorage.app'),
      true
    );
  });

  it('resolves member photos with tenant-scoped CDN fallback and filters broken directory placeholders', () => {
    assert.strictEqual(
      resolveMemberPhotoUrl('', '10018.jpg', 'inzanathletics'),
      '/member-photos/10018.jpg'
    );
    assert.strictEqual(
      resolveMemberPhotoUrl('', '10018.jpg', 'strike'),
      ''
    );
    assert.strictEqual(
      resolveMemberPhotoUrl('https://inzan.redgits.com/uploads/', '10018.jpg', 'inzanathletics'),
      '/member-photos/10018.jpg'
    );
    assert.strictEqual(
      resolveMemberPhotoUrl('/api/storage/file/abc12345', '10018.jpg', 'inzanathletics'),
      '/api/storage/file/abc12345'
    );
  });

  it('computes onError fallback URL for legacy RedGITS image URLs and photoLocal', () => {
    assert.strictEqual(
      getMemberPhotoFallbackUrl('https://inzan.redgits.com/uploads/members/9991-cam.jpg', null),
      '/member-photos/9991-cam.jpg'
    );
    assert.strictEqual(
      getMemberPhotoFallbackUrl('/member-photos/9991-cam.jpg', '9991-cam.jpg'),
      null
    );
    assert.strictEqual(
      getMemberPhotoFallbackUrl('https://example.com/missing.jpg', '10018.jpg'),
      '/member-photos/10018.jpg'
    );
  });
});
