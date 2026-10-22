import * as path from 'path';
import * as ort from 'onnxruntime-node';

async function inspectModel() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData/Roaming');
  const rifePath = path.join(appData, 'Kori', 'models', 'rife_v4.onnx');
  const modnetPath = path.join(appData, 'Kori', 'models', 'modnet.onnx');

  console.log('Loading RIFE session...');
  const rifeSession = await ort.InferenceSession.create(rifePath);
  console.log('RIFE inputNames:', rifeSession.inputNames);
  console.log('RIFE outputNames:', rifeSession.outputNames);

  console.log('Loading MODNet session...');
  const modnetSession = await ort.InferenceSession.create(modnetPath);
  console.log('MODNet inputNames:', modnetSession.inputNames);
  console.log('MODNet outputNames:', modnetSession.outputNames);
}

inspectModel().catch(console.error);
