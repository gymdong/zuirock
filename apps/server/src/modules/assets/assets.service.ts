import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { GrowthConfig } from '@zuirock/game-rules';
import type { AssetUploadResponse } from '@zuirock/shared';
import { ApiError, badRequest, notFound } from '../../common/api-error.js';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { PrismaService } from '../../common/prisma.service.js';

export const ASSET_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** Sniffs the real image type from magic bytes (the client-sent mimetype is not trusted). */
export function sniffImage(b: Buffer): (typeof ASSET_TYPES)[number] | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Images in PostgreSQL bytea, content-addressed by sha256 (plan §2.3(d)). */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig,
  ) {}

  async put(bytes: Buffer | undefined): Promise<AssetUploadResponse> {
    if (!bytes?.length) throw badRequest('FILE_REQUIRED', '이미지 파일이 필요해요');
    if (bytes.length > this.cfg.assets.maxBytes) throw new ApiError(HttpStatus.PAYLOAD_TOO_LARGE, 'FILE_TOO_LARGE', '1MB 이하 이미지만 올릴 수 있어요');
    const contentType = sniffImage(bytes);
    if (!contentType) throw new ApiError(HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'UNSUPPORTED_TYPE', 'PNG·JPEG·WEBP 이미지만 올릴 수 있어요');
    const key = createHash('sha256').update(bytes).digest('hex');
    await this.prisma.asset.upsert({
      where: { key },
      create: { key, contentType, size: bytes.length, bytes: new Uint8Array(bytes) },
      update: {},
    });
    return { key, url: `/api/assets/${key}` };
  }

  async get(key: string): Promise<{ contentType: string; bytes: Buffer }> {
    if (!/^[0-9a-f]{64}$/.test(key)) throw notFound('ASSET_NOT_FOUND', '이미지를 찾을 수 없어요');
    const a = await this.prisma.asset.findUnique({ where: { key } });
    if (!a) throw notFound('ASSET_NOT_FOUND', '이미지를 찾을 수 없어요');
    return { contentType: a.contentType, bytes: Buffer.from(a.bytes) };
  }
}
