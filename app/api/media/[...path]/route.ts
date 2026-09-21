import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { storageService } from '@/lib/services/storage.service';

function createSafeFileStream(fullPath: string, options?: { start?: number; end?: number }): ReadableStream<Uint8Array> {
  let fileStream: fs.ReadStream | null = null;
  let isClosed = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      fileStream = fs.createReadStream(fullPath, options);

      fileStream.on('data', (chunk: Buffer | string) => {
        if (isClosed) return;
        try {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          controller.enqueue(new Uint8Array(buffer));
        } catch {
          isClosed = true;
          fileStream?.destroy();
        }
      });

      fileStream.on('end', () => {
        if (isClosed) return;
        isClosed = true;
        try {
          controller.close();
        } catch {}
      });

      fileStream.on('error', () => {
        if (isClosed) return;
        isClosed = true;
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      isClosed = true;
      if (fileStream) {
        fileStream.destroy();
      }
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const relativeKey = params.path.join('/');
    const fullPath = storageService.getAbsolutePath(relativeKey);

    if (!fs.existsSync(fullPath)) {
      return new NextResponse('Media not found', { status: 404 });
    }

    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;
    const range = req.headers.get('range');

    let contentType = 'video/mp4';
    if (relativeKey.endsWith('.jpg') || relativeKey.endsWith('.jpeg')) {
      contentType = 'image/jpeg';
    } else if (relativeKey.endsWith('.png')) {
      contentType = 'image/png';
    } else if (relativeKey.endsWith('.webp')) {
      contentType = 'image/webp';
    }

    // Handle HTTP 206 Partial Content for video seeking
    if (range && contentType.startsWith('video/')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parts[0] ? parseInt(parts[0], 10) : 0;

      if (isNaN(start) || start >= fileSize) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
            'Accept-Ranges': 'bytes',
          },
        });
      }

      // Stream to the end of the file so HTML5 video buffers continuously without pausing
      const end = parts[1] && !isNaN(parseInt(parts[1], 10))
        ? Math.min(parseInt(parts[1], 10), fileSize - 1)
        : fileSize - 1;

      const chunkSize = end - start + 1;
      const webStream = createSafeFileStream(fullPath, { start, end });

      return new Response(webStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': contentType,
        },
      });
    }

    // Full stream response
    const webStream = createSafeFileStream(fullPath);

    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Length': fileSize.toString(),
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (err: any) {
    return new NextResponse(`Error serving media: ${err.message}`, { status: 500 });
  }
}
