import * as path from 'path';
import * as ort from 'onnxruntime-node';

async function checkShapes() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData/Roaming');
  const rifePath = path.join(appData, 'Kori', 'models', 'rife_v4.onnx');
  const session = await ort.InferenceSession.create(rifePath);
  
  // Test shapes [1, 6, 256, 256] or [1, 7, 256, 256] or [1, 3, 256, 256]
  for (const c of [6, 7, 3, 8]) {
    try {
      const dummy = new Float32Array(1 * c * 256 * 256);
      const tensor = new ort.Tensor('float32', dummy, [1, c, 256, 256]);
      const res = await session.run({ input: tensor });
      console.log(`Success with channels ${c}! Output shape:`, res.output.dims);
      break;
    } catch (e: any) {
      console.log(`Channels ${c} failed:`, e.message.slice(0, 100));
    }
  }
}

checkShapes().catch(console.error);
