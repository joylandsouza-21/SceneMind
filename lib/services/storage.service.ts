import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

export interface IStorageService {
  createVideoWriteStream(
    filename: string
  ): { storageKey: string; absolutePath: string; writeStream: fs.WriteStream };
  saveVideo(
    filename: string,
    data: Buffer | ReadableStream<Uint8Array> | NodeJS.ReadableStream
  ): Promise<{ storageKey: string; absolutePath: string }>;
  saveClip(filename: string, buffer: Buffer): Promise<{ storageKey: string; absolutePath: string }>;
  saveThumbnail(filename: string, buffer: Buffer): Promise<{ storageKey: string; absolutePath: string }>;
  getAbsolutePath(storageKey: string): string;
  fileExists(storageKey: string): boolean;
  deleteFile(storageKey: string): Promise<boolean>;
  getStream(storageKey: string, start?: number, end?: number): fs.ReadStream;
  getFileSize(storageKey: string): number;
}

export class LocalStorageService implements IStorageService {
  private baseDir: string;
  private videosDir: string;
  private clipsDir: string;
  private thumbnailsDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), 'storage');
    this.videosDir = path.join(this.baseDir, 'videos');
    this.clipsDir = path.join(this.baseDir, 'clips');
    this.thumbnailsDir = path.join(this.baseDir, 'thumbnails');

    this.ensureDirs();
  }

  private ensureDirs() {
    for (const dir of [this.baseDir, this.videosDir, this.clipsDir, this.thumbnailsDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private sanitizeFilename(name: string): string {
    return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  public createVideoWriteStream(filename: string): {
    storageKey: string;
    absolutePath: string;
    writeStream: fs.WriteStream;
  } {
    this.ensureDirs();
    const safeName = `${Date.now()}_${this.sanitizeFilename(filename)}`;
    const fullPath = path.join(this.videosDir, safeName);
    const writeStream = fs.createWriteStream(fullPath);
    return {
      storageKey: `videos/${safeName}`,
      absolutePath: fullPath,
      writeStream,
    };
  }

  public async saveVideo(
    filename: string,
    data: Buffer | ReadableStream<Uint8Array> | NodeJS.ReadableStream
  ): Promise<{ storageKey: string; absolutePath: string }> {
    this.ensureDirs();
    const safeName = `${Date.now()}_${this.sanitizeFilename(filename)}`;
    const fullPath = path.join(this.videosDir, safeName);

    if (Buffer.isBuffer(data)) {
      await fs.promises.writeFile(fullPath, data);
    } else {
      const nodeStream = (data as any).getReader
        ? Readable.fromWeb(data as any)
        : (data as NodeJS.ReadableStream);
      const writeStream = fs.createWriteStream(fullPath);
      await pipeline(nodeStream, writeStream);
    }

    return { storageKey: `videos/${safeName}`, absolutePath: fullPath };
  }

  public async saveClip(filename: string, buffer: Buffer): Promise<{ storageKey: string; absolutePath: string }> {
    this.ensureDirs();
    const safeName = `${Date.now()}_${this.sanitizeFilename(filename)}`;
    const fullPath = path.join(this.clipsDir, safeName);
    await fs.promises.writeFile(fullPath, buffer);
    return { storageKey: `clips/${safeName}`, absolutePath: fullPath };
  }

  public async saveThumbnail(filename: string, buffer: Buffer): Promise<{ storageKey: string; absolutePath: string }> {
    this.ensureDirs();
    const safeName = `${Date.now()}_${this.sanitizeFilename(filename)}`;
    const fullPath = path.join(this.thumbnailsDir, safeName);
    await fs.promises.writeFile(fullPath, buffer);
    return { storageKey: `thumbnails/${safeName}`, absolutePath: fullPath };
  }

  public getAbsolutePath(storageKey: string): string {
    const cleanKey = path.normalize(storageKey).replace(/^(\.\.(\/|\\|$))+/, '');
    return path.join(this.baseDir, cleanKey);
  }

  public fileExists(storageKey: string): boolean {
    const fullPath = this.getAbsolutePath(storageKey);
    return fs.existsSync(fullPath);
  }

  public async deleteFile(storageKey: string): Promise<boolean> {
    const fullPath = this.getAbsolutePath(storageKey);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
      return true;
    }
    return false;
  }

  public getStream(storageKey: string, start?: number, end?: number): fs.ReadStream {
    const fullPath = this.getAbsolutePath(storageKey);
    if (typeof start === 'number' && typeof end === 'number') {
      return fs.createReadStream(fullPath, { start, end });
    }
    return fs.createReadStream(fullPath);
  }

  public getFileSize(storageKey: string): number {
    const fullPath = this.getAbsolutePath(storageKey);
    if (fs.existsSync(fullPath)) {
      return fs.statSync(fullPath).size;
    }
    return 0;
  }

  public getVideosDir(): string {
    return this.videosDir;
  }

  public getClipsDir(): string {
    return this.clipsDir;
  }

  public getThumbnailsDir(): string {
    return this.thumbnailsDir;
  }
}

export const storageService = new LocalStorageService();
