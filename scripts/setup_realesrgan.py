import urllib.request
import os
import onnxruntime as ort
import hashlib

url = 'https://huggingface.co/deepghs/imgutils-models/resolve/main/real_esrgan/RealESRGAN_x4plus_anime_6B.onnx'
out_path = r'D:\motionforge\models\RealESRGAN_x4plus_anime_6B.onnx'

if not os.path.exists(out_path):
    print("Downloading RealESRGAN_x4plus_anime_6B.onnx...")
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp, open(out_path, 'wb') as f:
        f.write(resp.read())
    print("Downloaded!")

size_mb = os.path.getsize(out_path) / 1024 / 1024
sha256 = hashlib.sha256(open(out_path, 'rb').read()).hexdigest()
print(f"File size: {size_mb:.2f} MB, SHA-256: {sha256}")

# Probe with ONNX Runtime
session = ort.InferenceSession(out_path, providers=['DmlExecutionProvider', 'CPUExecutionProvider'])
print("Providers:", session.get_providers())
print("Inputs:", [(i.name, i.shape, i.type) for i in session.get_inputs()])
print("Outputs:", [(o.name, o.shape, o.type) for o in session.get_outputs()])
