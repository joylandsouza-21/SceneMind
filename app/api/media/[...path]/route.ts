import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { storageService } from '@/lib/services/storage.service';

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
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const fileStream = fs.createReadStream(fullPath, { start, end });
      const stream = new ReadableStream({
        start(controller) {
          fileStream.on('data', (chunk) => controller.enqueue(chunk));
          fileStream.on('end', () => controller.close());
          fileStream.on('error', (err) => controller.error(err));
        },
      });

      return new NextResponse(stream, {
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
    const fileStream = fs.createReadStream(fullPath);
    const stream = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => controller.enqueue(chunk));
        fileStream.on('end', () => controller.close());
        fileStream.on('error', (err) => controller.error(err));
      },
    });

    return new NextResponse(stream, {
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
