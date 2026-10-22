import * as path from 'path';
import * as ort from 'onnxruntime-node';

async function testModnetDml() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData/Roaming');
  const modnetPath = path.join(appData, 'Kori', 'models', 'modnet.onnx');

  console.log('Testing MODNet on DirectML (RTX 5060)...');
  const session = await ort.InferenceSession.create(modnetPath, {
    executionProviders: ['dml', 'cpu']
  });
  console.log('MODNet session created!');
  // MODNet photographic portrait matting standard input: [1, 3, 512, 512]
  const dummy = new Float32Array(1 * 3 * 512 * 512);
  const tensor = new ort.Tensor('float32', dummy, [1, 3, 512, 512]);
  
  const t0 = performance.now();
  const res = await session.run({ input: tensor });
  const t1 = performance.now();
  console.log(`MODNet DirectML run: ${(t1 - t0).toFixed(2)} ms! Output shape:`, res.output.dims);
}

testModnetDml().catch(console.error);
