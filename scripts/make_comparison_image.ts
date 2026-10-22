import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { FfmpegService } from '../electron/ffmpegService';

const execFileAsync = promisify(execFile);

async function makeComparisonImage() {
  const ffmpeg = FfmpegService.getFfmpegPath();
  const rifeMp4 = path.resolve('test-assets/results/slowmo_0.25x_rife_neural.mp4');
  const blendMp4 = path.resolve('test-assets/results/slowmo_0.25x_frame_blend.mp4');
  const compImg = path.resolve('test-assets/results/rife_vs_blending_comparison.jpg');

  await execFileAsync(ffmpeg, [
    '-y',
    '-ss', '0.5', '-i', rifeMp4,
    '-ss', '0.5', '-i', blendMp4,
    '-filter_complex', '[0:v][1:v]hstack',
    '-vframes', '1',
    '-q:v', '2',
    path.resolve('test-assets/results/rife_vs_blending_comparison.png')
  ]);
  console.log('Comparison image saved to rife_vs_blending_comparison.png');

  console.log('Comparison image saved to:', compImg);
}

makeComparisonImage().catch(console.error);
