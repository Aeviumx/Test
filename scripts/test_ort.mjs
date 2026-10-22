import * as ort from 'onnxruntime-node';

async function testOrt() {
  console.log('ORT object:', Object.keys(ort));
  console.log('ort.InferenceSession:', typeof ort.InferenceSession);
  if (ort.InferenceSession) {
    console.log('ORT session creators available');
  }
}

testOrt().catch(console.error);
