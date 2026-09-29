import { execFile, spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  format: string;
  sizeBytes: number;
  codec: string;
  pixFmt?: string;
  bitrate: number;
}

export interface CodecInspectionResult {
  isWebReady: boolean;
  canFastRemux: boolean;
  canCopyVideo: boolean;
  videoCodec: string;
  pixFmt: string;
  audioCodec: string;
  audioChannels: number;
  container: string;
  reason?: string;
}

export class FFmpegService {
  private ffmpegPath: string;
  private ffprobePath: string;
  private cachedHwEncoder: 'nvenc' | 'vaapi' | 'qsv' | 'cpu' | null = null;
  private activeProcesses: Map<string, Set<any>> = new Map();
  private abortedKeys: Set<string> = new Set();

  constructor() {
    this.ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    this.ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
  }

  public registerProcess(key: string, child: any): void {
    if (!this.activeProcesses.has(key)) {
      this.activeProcesses.set(key, new Set());
    }
    const set = this.activeProcesses.get(key)!;
    set.add(child);

    const cleanup = () => {
      set.delete(child);
      if (set.size === 0) {
        this.activeProcesses.delete(key);
      }
    };

    child.once('close', cleanup);
    child.once('exit', cleanup);
    child.once('error', cleanup);
  }

  public unregisterProcess(key: string, child: any): void {
    const set = this.activeProcesses.get(key);
    if (set) {
      set.delete(child);
      if (set.size === 0) {
        this.activeProcesses.delete(key);
      }
    }
  }

  public killProcesses(key: string): void {
    this.abortedKeys.add(key);
    const set = this.activeProcesses.get(key);
    if (set && set.size > 0) {
      console.log(`[FFMPEG] Terminating ${set.size} active child process(es) for key: ${key}`);
      for (const child of set) {
        try {
          child.kill('SIGKILL');
        } catch (e: any) {
          console.warn(`[FFMPEG] Error terminating process: ${e.message}`);
        }
      }
      this.activeProcesses.delete(key);
    }
  }

  public isAborted(key: string): boolean {
    return this.abortedKeys.has(key);
  }

  public clearAborted(key: string): void {
    this.abortedKeys.delete(key);
  }

  /**
   * Automatically detect available GPU encoder (NVIDIA NVENC, Intel VAAPI, QuickSync)
   * or fall back to high-performance multi-threaded CPU encoding.
   */
  public async getBestEncoder(): Promise<'nvenc' | 'vaapi' | 'qsv' | 'cpu'> {
    if (this.cachedHwEncoder) return this.cachedHwEncoder;

    // Check if user explicitly disabled GPU
    if (process.env.USE_GPU === 'false' || process.env.FFMPEG_ENCODER === 'cpu') {
      console.log('[FFMPEG] GPU disabled via config. Using multi-threaded CPU (libx264 ultrafast)');
      this.cachedHwEncoder = 'cpu';
      return 'cpu';
    }

    // 1. Test NVIDIA NVENC (GPU)
    try {
      await execFileAsync(this.ffmpegPath, [
        '-y', '-f', 'lavfi', '-i', 'testsrc=d=0.1:s=64x64',
        '-pix_fmt', 'yuv420p',
        '-c:v', 'h264_nvenc', '-f', 'null', '-'
      ]);
      console.log('[FFMPEG] Hardware encoder detected: NVIDIA NVENC (GPU accelerated)');
      this.cachedHwEncoder = 'nvenc';
      return 'nvenc';
    } catch (e: any) {}

    // 2. Test VAAPI (Intel/AMD GPU render node)
    if (fs.existsSync('/dev/dri/renderD128')) {
      try {
        await execFileAsync(this.ffmpegPath, [
          '-y', '-vaapi_device', '/dev/dri/renderD128',
          '-f', 'lavfi', '-i', 'testsrc=d=0.1:s=64x64',
          '-vf', 'format=nv12,hwupload',
          '-c:v', 'h264_vaapi', '-f', 'null', '-'
        ]);
        console.log('[FFMPEG] Hardware encoder detected: Intel/AMD VAAPI (GPU accelerated)');
        this.cachedHwEncoder = 'vaapi';
        return 'vaapi';
      } catch (e: any) {}
    }

    // 3. Test Intel QuickSync (QSV)
    try {
      await execFileAsync(this.ffmpegPath, [
        '-y', '-f', 'lavfi', '-i', 'testsrc=d=0.1:s=64x64',
        '-pix_fmt', 'nv12',
        '-c:v', 'h264_qsv', '-f', 'null', '-'
      ]);
      console.log('[FFMPEG] Hardware encoder detected: Intel QuickSync (GPU accelerated)');
      this.cachedHwEncoder = 'qsv';
      return 'qsv';
    } catch (e: any) {}

    console.log('[FFMPEG] GPU not available. Falling back to multi-threaded CPU (libx264 ultrafast)');
    this.cachedHwEncoder = 'cpu';
    return 'cpu';
  }

  public async inspectCodecCompatibility(filePath: string): Promise<CodecInspectionResult> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const args = [
      '-v', 'error',
      '-show_entries', 'stream=codec_name,codec_type,pix_fmt,channels:format=format_name',
      '-of', 'json',
      filePath,
    ];

    try {
      const { stdout } = await execFileAsync(this.ffprobePath, args);
      const data = JSON.parse(stdout);
      const streams = data.streams || [];
      const format = data.format || {};
      const formatName = (format.format_name || '').toLowerCase();
      const ext = path.extname(filePath).toLowerCase();

      const videoStream = streams.find((s: any) => s.codec_type === 'video') || {};
      const audioStream = streams.find((s: any) => s.codec_type === 'audio') || {};

      const videoCodec = (videoStream.codec_name || '').toLowerCase();
      const pixFmt = (videoStream.pix_fmt || '').toLowerCase();
      const audioCodec = (audioStream.codec_name || '').toLowerCase();
      const audioChannels = parseInt(audioStream.channels || '2', 10);

      // Check standard web container criteria:
      // Browser HTML5 <video> natively requires MP4 (or WebM) container with proper file extension.
      const isMp4Container = (formatName.includes('mp4') || formatName.includes('mov,mp4') || formatName === 'mp4') && ext === '.mp4';
      const isWebmContainer = formatName.includes('webm') && ext === '.webm';
      const isWebContainer = isMp4Container || isWebmContainer;

      // Check standard web playback video criteria: H.264 / AVC1, 8-bit yuv420p
      const isH264 = videoCodec === 'h264' || videoCodec === 'avc1';
      const is8BitYuv420 = pixFmt === 'yuv420p' || pixFmt === 'yuvj420p';
      const isStereoOrMono = audioChannels <= 2;
      const isStandardWebAudio = !audioCodec || audioCodec === 'aac' || audioCodec === 'mp3' || audioCodec === 'opus';

      // Can copy video stream (zero re-encode time) if video is already H.264 8-bit
      const canCopyVideo = isH264 && is8BitYuv420;

      // Can fast-remux (lossless stream copy in seconds) if codecs are web-ready but container is not MP4
      const canFastRemux = !isWebContainer && canCopyVideo && isStereoOrMono && isStandardWebAudio;

      if (isWebContainer && isH264 && is8BitYuv420 && isStereoOrMono && isStandardWebAudio) {
        return {
          isWebReady: true,
          canFastRemux: false,
          canCopyVideo: true,
          videoCodec,
          pixFmt,
          audioCodec,
          audioChannels,
          container: formatName,
        };
      }

      const issues: string[] = [];
      if (!isWebContainer) issues.push(`Container format "${formatName}" (${ext}) is not web-streamable MP4`);
      if (!isH264) issues.push(`Video codec "${videoCodec}" is not H.264/AVC`);
      if (!is8BitYuv420) issues.push(`Pixel format "${pixFmt}" is not standard 8-bit yuv420p`);
      if (!isStereoOrMono) issues.push(`${audioChannels}-channel audio needs downmixing to stereo`);
      if (!isStandardWebAudio) issues.push(`Audio codec "${audioCodec}" requires AAC re-encoding`);

      return {
        isWebReady: false,
        canFastRemux,
        canCopyVideo,
        videoCodec,
        pixFmt,
        audioCodec,
        audioChannels,
        container: formatName,
        reason: issues.join('; '),
      };
    } catch (err: any) {
      console.warn(`[FFMPEG] inspectCodecCompatibility fallback: ${err.message}`);
      return {
        isWebReady: false,
        canFastRemux: false,
        canCopyVideo: false,
        videoCodec: 'unknown',
        pixFmt: 'unknown',
        audioCodec: 'unknown',
        audioChannels: 2,
        container: 'unknown',
        reason: err.message,
      };
    }
  }

  public async remuxToWebMp4(inputVideoPath: string, outputVideoPath: string, abortKey?: string): Promise<string> {
    const dir = path.dirname(outputVideoPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const args = [
      '-i', inputVideoPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-y',
      outputVideoPath,
    ];

    return new Promise((resolve, reject) => {
      const child = spawn(this.ffmpegPath, args);
      if (abortKey) {
        this.registerProcess(abortKey, child);
      }
      let stderrAccum = '';
      child.stderr.on('data', (d) => {
        stderrAccum += d.toString();
      });
      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputVideoPath)) {
          resolve(outputVideoPath);
        } else {
          if (fs.existsSync(outputVideoPath)) {
            try { fs.unlinkSync(outputVideoPath); } catch {}
          }
          reject(new Error(`FFmpeg remux failed with code ${code}: ${stderrAccum.slice(-300)}`));
        }
      });
      child.on('error', reject);
    });
  }

  public async transcodeToWebH264(
    inputVideoPath: string,
    outputVideoPath: string,
    optionsOrProgress?:
      | {
          copyVideo?: boolean;
          onProgress?: (pct: number, statusMsg: string) => void;
          abortKey?: string;
        }
      | ((pct: number, statusMsg: string) => void)
  ): Promise<string> {
    const options = typeof optionsOrProgress === 'function'
      ? { onProgress: optionsOrProgress }
      : (optionsOrProgress || {});

    const dir = path.dirname(outputVideoPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const meta = await this.getMetadata(inputVideoPath).catch(() => ({ duration: 60 }));
    const totalDuration = Math.max(1, meta.duration || 60);

    // If video stream is already H.264 8-bit, do a stream copy of the video (takes 2-3s!)
    if (options.copyVideo) {
      return new Promise((resolve, reject) => {
        const args = [
          '-i', inputVideoPath,
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-ac', '2',
          '-b:a', '192k',
          '-movflags', '+faststart',
          '-y',
          outputVideoPath,
        ];

        const child = spawn(this.ffmpegPath, args);
        if (options.abortKey) {
          this.registerProcess(options.abortKey, child);
        }
        let stderrAccum = '';

        child.stderr.on('data', (d) => {
          stderrAccum += d.toString();
          if (options.onProgress) options.onProgress(50, 'Copying video stream (instant)...');
        });

        child.on('close', (code) => {
          if (options.abortKey && this.isAborted(options.abortKey)) {
            if (fs.existsSync(outputVideoPath)) {
              try { fs.unlinkSync(outputVideoPath); } catch {}
            }
            return reject(new Error('TRANSCODE_ABORTED_BY_USER'));
          }
          if (code === 0 && fs.existsSync(outputVideoPath)) {
            if (options.onProgress) options.onProgress(100, 'Stream copy complete (100%)');
            resolve(outputVideoPath);
          } else {
            if (fs.existsSync(outputVideoPath)) {
              try { fs.unlinkSync(outputVideoPath); } catch {}
            }
            reject(new Error(`FFmpeg stream copy failed with code ${code}: ${stderrAccum.slice(-500)}`));
          }
        });

        child.on('error', reject);
      });
    }

    // Determine whether to use GPU or CPU
    const encoder = await this.getBestEncoder();

    const buildArgs = (enc: 'nvenc' | 'vaapi' | 'qsv' | 'cpu'): string[] => {
      if (enc === 'nvenc') {
        return [
          '-i', inputVideoPath,
          '-c:v', 'h264_nvenc',
          '-preset', 'p4',
          '-cq', '23',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-ac', '2',
          '-b:a', '192k',
          '-movflags', '+faststart',
          '-y',
          outputVideoPath,
        ];
      }

      if (enc === 'vaapi') {
        return [
          '-vaapi_device', '/dev/dri/renderD128',
          '-i', inputVideoPath,
          '-vf', 'format=nv12,hwupload',
          '-c:v', 'h264_vaapi',
          '-qp', '23',
          '-c:a', 'aac',
          '-ac', '2',
          '-b:a', '192k',
          '-movflags', '+faststart',
          '-y',
          outputVideoPath,
        ];
      }

      if (enc === 'qsv') {
        return [
          '-i', inputVideoPath,
          '-c:v', 'h264_qsv',
          '-preset', 'veryfast',
          '-global_quality', '23',
          '-c:a', 'aac',
          '-ac', '2',
          '-b:a', '192k',
          '-movflags', '+faststart',
          '-y',
          outputVideoPath,
        ];
      }

      // Default: Multi-threaded CPU ultrafast
      return [
        '-i', inputVideoPath,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '22',
        '-pix_fmt', 'yuv420p',
        '-threads', '0',
        '-c:a', 'aac',
        '-ac', '2',
        '-b:a', '192k',
        '-movflags', '+faststart',
        '-y',
        outputVideoPath,
      ];
    };

    const runSpawn = (args: string[], encoderLabel: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const child = spawn(this.ffmpegPath, args);
        if (options.abortKey) {
          this.registerProcess(options.abortKey, child);
        }
        let stderrAccum = '';

        child.stderr.on('data', (data) => {
          const text = data.toString();
          stderrAccum += text;
          const timeMatch = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
          if (timeMatch && options?.onProgress) {
            const hours = parseInt(timeMatch[1], 10);
            const minutes = parseInt(timeMatch[2], 10);
            const seconds = parseFloat(timeMatch[3]);
            const currentSecs = hours * 3600 + minutes * 60 + seconds;
            const pct = Math.min(99, Math.max(1, Math.round((currentSecs / totalDuration) * 100)));
            const fpsMatch = text.match(/fps=\s*(\d+)/);
            const fpsText = fpsMatch ? ` @ ${fpsMatch[1]} fps` : '';
            const speedMatch = text.match(/speed=\s*([\d.]+x)/);
            const speedText = speedMatch ? ` (${speedMatch[1]})` : '';
            options.onProgress(pct, `Converting (${encoderLabel} ${pct}%${fpsText}${speedText})...`);
          }
        });

        child.on('close', (code) => {
          if (options.abortKey && this.isAborted(options.abortKey)) {
            if (fs.existsSync(outputVideoPath)) {
              try { fs.unlinkSync(outputVideoPath); } catch {}
            }
            return reject(new Error('TRANSCODE_ABORTED_BY_USER'));
          }
          if (code === 0 && fs.existsSync(outputVideoPath)) {
            if (options?.onProgress) options.onProgress(100, `Conversion complete via ${encoderLabel} (100%)`);
            resolve(outputVideoPath);
          } else {
            if (fs.existsSync(outputVideoPath)) {
              try { fs.unlinkSync(outputVideoPath); } catch {}
            }
            reject(new Error(`FFmpeg transcode failed (${encoderLabel}, code ${code}): ${stderrAccum.slice(-500)}`));
          }
        });

        child.on('error', (err) => {
          reject(err);
        });
      });
    };

    // Try GPU encoder first if available; fall back to CPU if GPU execution fails
    try {
      const label = encoder === 'nvenc' ? 'GPU NVENC' : encoder === 'vaapi' ? 'GPU VAAPI' : encoder === 'qsv' ? 'GPU QSV' : 'CPU';
      return await runSpawn(buildArgs(encoder), label);
    } catch (gpuErr: any) {
      if (options.abortKey && this.isAborted(options.abortKey)) {
        throw gpuErr;
      }
      if (encoder !== 'cpu') {
        console.warn(`[FFMPEG] GPU encoder (${encoder}) failed at runtime (${gpuErr.message}). Falling back to CPU ultrafast...`);
        this.cachedHwEncoder = 'cpu';
        if (options?.onProgress) options.onProgress(1, 'GPU failed, falling back to CPU ultrafast...');
        return await runSpawn(buildArgs('cpu'), 'CPU (fallback)');
      }
      throw gpuErr;
    }
  }

  public async getMetadata(filePath: string): Promise<VideoMetadata> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at path: ${filePath}`);
    }

    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration,size,format_name,bit_rate:stream=width,height,r_frame_rate,codec_name',
      '-select_streams', 'v:0',
      '-of', 'json',
      filePath,
    ];

    try {
      const { stdout } = await execFileAsync(this.ffprobePath, args);
      const data = JSON.parse(stdout);

      const stream = data.streams?.[0] || {};
      const format = data.format || {};

      let fps = 30;
      if (stream.r_frame_rate) {
        const [num, den] = stream.r_frame_rate.split('/').map(Number);
        if (num && den && den !== 0) {
          fps = Math.round((num / den) * 100) / 100;
        }
      }

      const duration = parseFloat(format.duration || stream.duration || '0');
      const width = parseInt(stream.width || '1280', 10);
      const height = parseInt(stream.height || '720', 10);
      const sizeBytes = parseInt(format.size || '0', 10) || fs.statSync(filePath).size;
      const codec = stream.codec_name || 'h264';
      const bitrate = parseInt(format.bit_rate || '0', 10);

      return {
        duration,
        width,
        height,
        fps,
        format: format.format_name || path.extname(filePath).replace('.', ''),
        sizeBytes,
        codec,
        bitrate,
      };
    } catch (err: any) {
      console.warn(`FFprobe failed, falling back to file inspection: ${err.message}`);
      const stats = fs.statSync(filePath);
      return {
        duration: 60,
        width: 1280,
        height: 720,
        fps: 30,
        format: 'mp4',
        sizeBytes: stats.size,
        codec: 'h264',
        bitrate: 1500000,
      };
    }
  }

  public async extractThumbnail(inputVideoPath: string, timestampSeconds: number, outputImagePath: string): Promise<string> {
    const dir = path.dirname(outputImagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const args = [
      '-ss', timestampSeconds.toString(),
      '-i', inputVideoPath,
      '-frames:v', '1',
      '-q:v', '2',
      '-vf', 'scale=640:-1',
      '-y',
      outputImagePath,
    ];

    await execFileAsync(this.ffmpegPath, args);
    return outputImagePath;
  }

  public async createClip(
    inputVideoPath: string,
    startTimeSeconds: number,
    endTimeSeconds: number,
    outputClipPath: string,
    onProgress?: (progressPercent: number) => void
  ): Promise<string> {
    const dir = path.dirname(outputClipPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const clipDuration = Math.max(0.5, endTimeSeconds - startTimeSeconds);

    return new Promise((resolve, reject) => {
      const args = [
        '-ss', startTimeSeconds.toFixed(3),
        '-i', inputVideoPath,
        '-t', clipDuration.toFixed(3),
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-preset', 'fast',
        '-crf', '22',
        '-movflags', '+faststart',
        '-y',
        outputClipPath,
      ];

      const child = spawn(this.ffmpegPath, args);
      let stderrAccum = '';

      child.stderr.on('data', (data) => {
        const str = data.toString();
        stderrAccum += str;

        // Parse progress time: time=00:00:12.34
        const match = str.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (match && onProgress) {
          const hours = parseFloat(match[1]);
          const minutes = parseFloat(match[2]);
          const seconds = parseFloat(match[3]);
          const totalSecs = hours * 3600 + minutes * 60 + seconds;
          const pct = Math.min(99, Math.round((totalSecs / clipDuration) * 100));
          onProgress(pct);
        }
      });

      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputClipPath)) {
          if (onProgress) onProgress(100);
          resolve(outputClipPath);
        } else {
          reject(new Error(`FFmpeg exited with code ${code}: ${stderrAccum.slice(-500)}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  public async generateSyntheticDemoVideo(outputPath: string): Promise<string> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Generate a 60-second multi-scene test video with 5 distinct scenes using FFmpeg filters
    // Scene 1: 0-12s Kitchen Conversation (Blue)
    // Scene 2: 12-25s Alley Fight (Dark Red)
    // Scene 3: 25-38s Red Car Driving (Amber)
    // Scene 4: 38-50s Park Dog Walking (Forest Green)
    // Scene 5: 50-60s Building Entrance (Dark Cyan)
    const filterComplex = [
      'color=c=#1e3a8a:s=1280x720:d=12[s1];',
      'color=c=#7f1d1d:s=1280x720:d=13[s2];',
      'color=c=#78350f:s=1280x720:d=13[s3];',
      'color=c=#14532d:s=1280x720:d=12[s4];',
      'color=c=#164e63:s=1280x720:d=10[s5];',
      '[s1]drawtext=text=\'SCENE 1\\: Kitchen Conversation\\nTwo people having coffee\':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=(h-text_h)/2[v1];',
      '[s2]drawtext=text=\'SCENE 2\\: Dark Alley Fight\\nTwo men in violent physical confrontation\':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=(h-text_h)/2[v2];',
      '[s3]drawtext=text=\'SCENE 3\\: Red Car Driving\\nVehicle speeding through street intersection\':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=(h-text_h)/2[v3];',
      '[s4]drawtext=text=\'SCENE 4\\: Sunny Park\\nPerson walking a golden retriever dog\':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=(h-text_h)/2[v4];',
      '[s5]drawtext=text=\'SCENE 5\\: Office Building\\nMan in dark suit enters headquarters\':fontcolor=white:fontsize=44:x=(w-text_w)/2:y=(h-text_h)/2[v5];',
      '[v1][v2][v3][v4][v5]concat=n=5:v=1:a=0[outv]',
    ].join('');

    const args = [
      '-f', 'lavfi',
      '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-filter_complex', filterComplex,
      '-map', '[outv]',
      '-map', '0:a',
      '-t', '60',
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-pix_fmt', 'yuv420p',
      '-y',
      outputPath,
    ];

    try {
      await execFileAsync(this.ffmpegPath, args);
      return outputPath;
    } catch (err: any) {
      // If drawtext filter lacks libfreetype, fallback to simple color concatenation without text
      console.warn(`Drawtext filter failed (${err.message}), falling back to standard color concat:`);
      const simpleFilter = [
        'color=c=#1e3a8a:s=1280x720:d=12[s1];',
        'color=c=#7f1d1d:s=1280x720:d=13[s2];',
        'color=c=#78350f:s=1280x720:d=13[s3];',
        'color=c=#14532d:s=1280x720:d=12[s4];',
        'color=c=#164e63:s=1280x720:d=10[s5];',
        '[s1][s2][s3][s4][s5]concat=n=5:v=1:a=0[outv]',
      ].join('');

      const fallbackArgs = [
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-filter_complex', simpleFilter,
        '-map', '[outv]',
        '-map', '0:a',
        '-t', '60',
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-pix_fmt', 'yuv420p',
        '-y',
        outputPath,
      ];
      await execFileAsync(this.ffmpegPath, fallbackArgs);
      return outputPath;
    }
  }
}

export const ffmpegService = new FFmpegService();
