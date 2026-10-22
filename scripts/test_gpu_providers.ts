import * as path from 'path';
import * as ort from 'onnxruntime-node';

async function testGpuProviders() {
  const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData/Roaming');
  const rifePath = path.join(appData, 'Kori', 'models', 'rife_v4.onnx');

  console.log('Testing DirectML provider on RTX 5060...');
  try {
    const sessionDml = await ort.InferenceSession.create(rifePath, {
      executionProviders: ['dml', 'cpu']
    });
    console.log('DirectML session created successfully!');
    
    // Benchmark 1 frame inference
    const dummy = new Float32Array(1 * 6 * 256 * 256);
    const tensor = new ort.Tensor('float32', dummy, [1, 6, 256, 256]);
    
    const t0 = performance.now();
    await sessionDml.run({ input: tensor });
    const t1 = performance.now();
    console.log(`DirectML warm-up run: ${(t1 - t0).toFixed(2)} ms`);

    const t2 = performance.now();
    for (let i = 0; i < 5; i++) {
      await sessionDml.run({ input: tensor });
    }
    const t3 = performance.now();
    console.log(`DirectML average inference time: ${((t3 - t2) / 5).toFixed(2)} ms per frame!`);
  } catch (err: any) {
    console.warn('DirectML not available or error:', err.message);
    console.log('Testing CPU fallback...');
    const sessionCpu = await ort.InferenceSession.create(rifePath, {
      executionProviders: ['cpu']
    });
    const dummy = new Float32Array(1 * 6 * 256 * 256);
    const tensor = new ort.Tensor('float32', dummy, [1, 6, 256, 256]);
    const t0 = performance.now();
    await sessionCpu.run({ input: tensor });
    const t1 = performance.now();
    console.log(`CPU inference time: ${(t1 - t0).toFixed(2)} ms`);
  }
}

testGpuProviders().catch(console.error);
