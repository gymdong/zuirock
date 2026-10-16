import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Static root: STATIC_ROOT or `<cwd>/public` (image: /app/public/{web,admin}, infra/Dockerfile contract). */
export function staticRoot(): string {
  return resolve(process.env.STATIC_ROOT ?? join(process.cwd(), 'public'));
}

/** assetlinks.json from ANDROID_CERT_SHA256 (comma-separated) and ANDROID_PACKAGE (default com.zuirock.app). */
export function assetLinks(): unknown[] {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return [
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: process.env.ANDROID_PACKAGE || 'com.zuirock.app', sha256_cert_fingerprints: fingerprints },
    },
  ];
}

function fileIn(root: string, urlPath: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const full = normalize(join(root, rel));
  if (full !== root && !full.startsWith(root + sep)) return null;
  return existsSync(full) && statSync(full).isFile() ? full : null;
}

function send(res: Response, file: string, immutable: boolean): void {
  res.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
  createReadStream(file).pipe(res);
}

/**
 * Single-origin routing after the Nest routes (plan §2.3(e)): /api and /socket.io are never
 * handled here; /.well-known/assetlinks.json; /admin/* (admin SPA, fallback /admin/index.html);
 * Expo web files; other GET + Accept text/html → Expo index.html; everything else falls to 404.
 */
export function staticMiddleware(root = staticRoot()) {
  const web = join(root, 'web');
  const admin = join(root, 'admin');
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const path = req.path;
    if (path === '/api' || path.startsWith('/api/') || path.startsWith('/socket.io')) return next();
    if (path === '/.well-known/assetlinks.json') {
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(assetLinks());
      return;
    }
    if (path.startsWith('/.well-known/')) return next();
    const html = (req.headers.accept ?? '').includes('text/html');
    if (path === '/admin' || path.startsWith('/admin/')) {
      const file = fileIn(admin, path.slice('/admin'.length) || '/');
      if (file) return send(res, file, /\/assets\//.test(path));
      const index = join(admin, 'index.html');
      if (html && existsSync(index)) return send(res, index, false);
      return next();
    }
    const file = path === '/' ? null : fileIn(web, path);
    if (file) return send(res, file, /\/_expo\/static\//.test(path));
    const index = join(web, 'index.html');
    if ((html || path === '/') && existsSync(index)) return send(res, index, false);
    next();
  };
}

/** Registered in onModuleInit, i.e. after Nest's routes and before its 404 handler. */
@Module({})
export class StaticModule implements OnModuleInit {
  constructor(private readonly host: HttpAdapterHost) {}

  onModuleInit(): void {
    this.host.httpAdapter.use(staticMiddleware());
  }
}
