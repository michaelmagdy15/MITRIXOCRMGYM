import argparse
import os
import sys
from pathlib import Path
from PIL import Image, ImageOps


def optimize_image(src_path: Path, dst_path: Path, max_size: int = 320, quality: int = 80) -> tuple[bool, str]:
    try:
        with Image.open(src_path) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode != 'RGB':
                img = img.convert('RGB')
            # Center-crop slightly only if extreme aspect ratio, or clean proportional thumbnail up to 320x320
            img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            img.save(dst_path, format='JPEG', quality=quality, optimize=True)
        return True, ''
    except Exception as exc:
        return False, str(exc)


def main() -> int:
    parser = argparse.ArgumentParser(description='Optimize rescued Inzan member photos for Cloudflare Pages CDN.')
    parser.add_argument('--force', action='store_true', help='Re-optimize even if output file already exists')
    args = parser.parse_args()

    root = Path.cwd()
    src_dir = root / 'backups' / 'member_photos'
    out_dir = root / 'backups' / 'member_photos_web'
    out_dir.mkdir(parents=True, exist_ok=True)

    jobs: list[tuple[Path, Path]] = []
    if src_dir.exists():
        for entry in sorted(src_dir.iterdir()):
            if entry.is_file():
                jobs.append((entry, out_dir / entry.name))

    extra_sources = [
        (
            root / 'backups' / 'rescue_20261117' / 'storage_faa' / 'member_photos' / 'redgits-4119',
            out_dir / 'redgits-4119.jpg',
        ),
        (
            root / 'backups' / 'rescue_20261117' / 'storage_faa' / 'avatars' / 'RJIBk1vcsXZ02ARucdPcOhmhkBf2',
            out_dir / 'avatar-RJIBk1vcsXZ02ARucdPcOhmhkBf2.jpg',
        ),
    ]
    for src, dst in extra_sources:
        if src.exists() and src.is_file():
            jobs.append((src, dst))

    processed = 0
    skipped = 0
    errors: list[str] = []

    for src, dst in jobs:
        if dst.exists() and not args.force:
            skipped += 1
            continue
        ok, err = optimize_image(src, dst)
        if ok:
            processed += 1
        else:
            errors.append(f'{src.name}: {err}')

    total_files = sum(1 for p in out_dir.iterdir() if p.is_file())
    total_bytes = sum(p.stat().st_size for p in out_dir.iterdir() if p.is_file())
    total_mb = total_bytes / (1024 * 1024)

    print(
        f'[optimize-inzan-photos] total_jobs={len(jobs)} processed={processed} skipped={skipped} '
        f'errors={len(errors)} output_files={total_files} output_size={total_mb:.2f} MB'
    )
    if errors:
        for e in errors[:10]:
            print('  ERR:', e)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
