import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { storageService } from '@/lib/services/storage.service';

/**
 * Converts a Node.js fs.ReadStream to a Web ReadableStream that safely handles
 * client disconnects, backpressure, and prevents ERR_INVALID_STATE uncaught exceptions.
 */
function nodeStreamToSafeWebStream(
  stream: fs.ReadStream,
  signal?: AbortSignal
): ReadableStream<Uint8Array> {
  let isClosed = false;

  const safeClose = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (isClosed) return;
    isClosed = true;
    try {
      controller.close();
    } catch {}
    try {
      stream.destroy();
    } catch {}
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (signal?.aborted) {
        safeClose(controller);
        return;
      }

      signal?.addEventListener(
        'abort',
        () => {
          safeClose(controller);
        },
        { once: true }
      );

      stream.on('data', (chunk: Buffer | string) => {
        if (isClosed || signal?.aborted) {
          try {
            stream.destroy();
          } catch {}
          return;
        }
        try {
          const u8 = Buffer.isBuffer(chunk) ? new Uint8Array(chunk) : new Uint8Array(Buffer.from(chunk));
          controller.enqueue(u8);
        } catch {
          // If controller is already closed by client disconnect, suppress and cleanup
          isClosed = true;
          try {
            stream.destroy();
          } catch {}
        }
      });

      stream.on('end', () => {
        safeClose(controller);
      });

      stream.on('error', () => {
        safeClose(controller);
      });

      stream.on('close', () => {
        safeClose(controller);
      });
    },
    cancel() {
      isClosed = true;
      try {
        stream.destroy();
      } catch {}
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

      const end = parts[1] && !isNaN(parseInt(parts[1], 10))
        ? Math.min(parseInt(parts[1], 10), fileSize - 1)
        : fileSize - 1;

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(fullPath, { start, end });
      const webStream = nodeStreamToSafeWebStream(fileStream, req.signal);

      return new Response(webStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Full stream response
    const fileStream = fs.createReadStream(fullPath);
    const webStream = nodeStreamToSafeWebStream(fileStream, req.signal);

    return new Response(webStream, {
      status: 200,
      headers: {
        'Content-Length': fileSize.toString(),
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err: any) {
    return new NextResponse(`Error serving media: ${err.message}`, { status: 500 });
  }
}
