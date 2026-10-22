import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        const redirect = res.headers.location;
        if (!redirect) return reject(new Error('Redirect with no location'));
        return downloadFile(redirect, destPath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Status ${res.statusCode}`));
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', (err) => {
        fs.unlinkSync(destPath);
        reject(err);
      });
    }).on('error', reject);
  });
}

async function main() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData/Roaming');
  const modelsDir = path.join(appData, 'Kori', 'models');
  fs.mkdirSync(modelsDir, { recursive: true });

  const rifeDest = path.join(modelsDir, 'rife_v4.onnx');
  const modnetDest = path.join(modelsDir, 'modnet.onnx');

  console.log('Downloading RIFE model to:', rifeDest);
  if (!fs.existsSync(rifeDest) || fs.statSync(rifeDest).size < 10 * 1024 * 1024) {
    await downloadFile('https://huggingface.co/FuryTMP/RIFE_fp32/resolve/main/RIFE_fp32.onnx', rifeDest);
  }
  console.log('RIFE model size:', (fs.statSync(rifeDest).size / (1024 * 1024)).toFixed(2), 'MB');

  console.log('Downloading MODNet model to:', modnetDest);
  if (!fs.existsSync(modnetDest) || fs.statSync(modnetDest).size < 10 * 1024 * 1024) {
    await downloadFile('https://huggingface.co/gradio/Modnet/resolve/main/modnet.onnx', modnetDest);
  }
  console.log('MODNet model size:', (fs.statSync(modnetDest).size / (1024 * 1024)).toFixed(2), 'MB');
  console.log('Models ready!');
}

main().catch(console.error);
