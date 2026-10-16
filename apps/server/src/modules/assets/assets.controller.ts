import { Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AssetUploadResponse } from '@zuirock/shared';
import type { Response } from 'express';
import { Auth } from '../../common/auth.guard.js';
import { AssetsService } from './assets.service.js';

/** multipart field `file`; multer stops reading one byte past the limit so oversize files answer 413. */
const UPLOAD_LIMIT = 1024 * 1024 + 1;

@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Post()
  @Auth()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_LIMIT, files: 1 } }))
  upload(@UploadedFile() file?: { buffer: Buffer }): Promise<AssetUploadResponse> {
    return this.assets.put(file?.buffer);
  }

  @Get(':key')
  async get(@Param('key') key: string, @Res() res: Response): Promise<void> {
    const a = await this.assets.get(key);
    res.set({ 'Content-Type': a.contentType, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
    res.send(a.bytes);
  }
}
