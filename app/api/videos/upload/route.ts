import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { db } from '@/lib/db';
import { Video } from '@/lib/db/types';
import { storageService } from '@/lib/services/storage.service';
import { ffmpegService } from '@/lib/services/ffmpeg.service';
import { jobQueueService } from '@/lib/services/job-queue.service';
import { Readable } from 'stream';
import busboy from 'busboy';

export const dynamic = 'force-dynamic';

interface ParsedUpload {
  originalName: string;
  storageKey: string;
  absolutePath: string;
  fields: Record<string, string>;
  fileSize: number;
}

/**
 * Stream multipart/form-data directly to disk using busboy
 * Eliminates multi-gigabyte RAM buffering in Node.js
 */
function streamMultipartUpload(req: NextRequest): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return reject(new Error('Invalid content-type. Expected multipart/form-data'));
    }

    if (!req.body) {
      return reject(new Error('No request body provided'));
    }

    const bb = busboy({ headers: { 'content-type': contentType } });
    const fields: Record<string, string> = {};
    let fileUploaded = false;
    let originalName = '';
    let storageKey = '';
    let absolutePath = '';
    let fileSize = 0;
    let filePromise: Promise<void> | null = null;

    bb.on('file', (name, fileStream, info) => {
      const filename = info.filename || 'uploaded_video.mp4';
      originalName = filename;
      const ext = filename.split('.').pop()?.toLowerCase();
      const allowed = ['mp4', 'mkv', 'mov', 'webm', 'avi'];
      if (!ext || !allowed.includes(ext)) {
        fileStream.resume();
        return reject(new Error(`Unsupported file format .${ext}. Supported formats: ${allowed.join(', ')}`));
      }

      const writeInfo = storageService.createVideoWriteStream(filename);
      storageKey = writeInfo.storageKey;
      absolutePath = writeInfo.absolutePath;
      fileUploaded = true;

      filePromise = new Promise((resolveFile, rejectFile) => {
        fileStream.on('data', (chunk: Buffer) => {
          fileSize += chunk.length;
          // Google Gemini File API maximum file size: 2 GB
          if (fileSize > 2 * 1024 * 1024 * 1024) {
            writeInfo.writeStream.destroy();
            storageService.deleteFile(storageKey).catch(() => {});
            return rejectFile(new Error('File size exceeds Google File API limit of 2 GB.'));
          }
        });

        fileStream.pipe(writeInfo.writeStream);

        writeInfo.writeStream.on('finish', () => {
          resolveFile();
        });

        writeInfo.writeStream.on('error', (err) => {
          rejectFile(err);
        });

        fileStream.on('error', (err) => {
          writeInfo.writeStream.destroy();
          rejectFile(err);
        });
      });
    });

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('close', async () => {
      try {
        if (filePromise) {
          await filePromise;
        }
        if (!fileUploaded) {
          return reject(new Error('No video file provided'));
        }
        resolve({
          originalName,
          storageKey,
          absolutePath,
          fields,
          fileSize,
        });
      } catch (err) {
        reject(err);
      }
    });

    bb.on('error', (err) => {
      if (storageKey) {
        storageService.deleteFile(storageKey).catch(() => {});
      }
      reject(err);
    });

    const nodeStream = Readable.fromWeb(req.body as any);
    nodeStream.pipe(bb);
  });
}

export async function POST(req: NextRequest) {
  let uploadedKey: string | undefined;
  try {
    const { originalName, storageKey, absolutePath, fields } = await streamMultipartUpload(req);
    uploadedKey = storageKey;

    // Extract preliminary metadata via ffprobe
    const metadata = await ffmpegService.getMetadata(absolutePath);

    const videoId = `vid_${uuidv4()}`;

    // Handle group association
    let groupId = fields.groupId || undefined;
    let groupName = fields.groupName || undefined;

    if (groupId) {
      const existingGroup = db.getGroup(groupId);
      if (existingGroup) {
        groupName = existingGroup.name;
      }
    } else if (groupName && groupName.trim()) {
      groupName = groupName.trim();
      const existingGroup = db.getGroups().find((g) => g.name.toLowerCase() === groupName!.toLowerCase());
      if (existingGroup) {
        groupId = existingGroup.id;
        groupName = existingGroup.name;
      } else {
        const newGroup = {
          id: `grp_${uuidv4()}`,
          name: groupName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        db.upsertGroup(newGroup);
        groupId = newGroup.id;
      }
    }

    const video: Video = {
      id: videoId,
      filename: originalName,
      originalName,
      storagePath: storageKey,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
      format: metadata.format,
      sizeBytes: metadata.sizeBytes,
      status: 'pending',
      processingProgress: 0,
      groupId,
      groupName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.upsertVideo(video);

    const isAsync = fields.async === 'true' || req.nextUrl.searchParams.get('async') === 'true';
    const autoIndex = fields.autoIndex !== 'false';

    if (isAsync) {
      if (autoIndex) {
        // Fire asynchronously in background
        jobQueueService.processVideoPipeline(videoId).catch((err) => {
          console.error(`[ASYNC_UPLOAD_PIPELINE] Error processing video ${videoId}:`, err);
        });
      }
      return NextResponse.json({
        success: true,
        video,
        message: 'Video uploaded and processing queued.',
      });
    }

    // Run the indexing pipeline synchronously so we can roll back on failure
    if (autoIndex) {
      try {
        await jobQueueService.processVideoPipeline(videoId);

        // Confirm it finished successfully
        const finalVideo = db.getVideo(videoId);
        if (finalVideo?.status === 'failed') {
          await storageService.deleteFile(storageKey);
          db.deleteVideo(videoId);
          const errMsg = finalVideo.errorMessage || 'AI analysis failed. Check your Gemini API key or try again later.';
          return NextResponse.json({ error: errMsg }, { status: 500 });
        }
      } catch (pipelineErr: any) {
        await storageService.deleteFile(storageKey).catch(() => {});
        db.deleteVideo(videoId);
        console.error(`[UPLOAD] Pipeline failed for ${videoId}:`, pipelineErr);
        return NextResponse.json(
          { error: pipelineErr.message || 'Video processing failed. Please try again.' },
          { status: 500 }
        );
      }
    }

    const finalVideo = db.getVideo(videoId) || video;
    return NextResponse.json({
      success: true,
      video: finalVideo,
      message: 'Video uploaded and indexed successfully.',
    });
  } catch (err: any) {
    if (uploadedKey) {
      storageService.deleteFile(uploadedKey).catch(() => {});
    }
    console.error('Upload route error:', err);
    return NextResponse.json({ error: err.message || 'Failed to upload video' }, { status: 500 });
  }
}
