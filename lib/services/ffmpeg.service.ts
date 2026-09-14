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
  bitrate: number;
}

export class FFmpegService {
  private ffmpegPath: string;
  private ffprobePath: string;

  constructor() {
    this.ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    this.ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
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
