async function testOrt() {
  const ort = require('onnxruntime-node');
  console.log('ORT version:', ort.version);
  const providers = ort.getAvailableProviders ? ort.getAvailableProviders() : [];
  console.log('Available providers:', providers);
}

testOrt().catch(console.error);
