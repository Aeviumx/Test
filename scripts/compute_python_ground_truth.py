import os
import cv2
import json
import numpy as np
import onnxruntime as ort

ART_PATH = r"D:\motionforge\public\assets\gacha_lucia.png"
OUT_DIR = r"D:\motionforge\test-assets\cache\py_gt"
os.makedirs(OUT_DIR, exist_ok=True)

img_bgr = cv2.imread(ART_PATH)
h0, w0 = img_bgr.shape[:2]
img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
print(f"Loaded image: {ART_PATH} ({w0}x{h0})")

# 1. SkyTNT IS-Net Segmentation
print("Running Python IS-Net...")
isnet_sess = ort.InferenceSession(r"D:\motionforge\models\isnetis.onnx", providers=['CPUExecutionProvider'])
s = 1024
h, w = (s, int(s * w0 / h0)) if h0 > w0 else (int(s * h0 / w0), s)
ph, pw = s - h, s - w
img_norm = (img_bgr / 255.0).astype(np.float32)
img_resized = cv2.resize(img_norm, (w, h))
img_input = np.zeros([1024, 1024, 3], dtype=np.float32)
img_input[ph//2:ph//2+h, pw//2:pw//2+w] = img_resized
img_input = np.transpose(img_input, (2, 0, 1))[np.newaxis, :]

out_isnet = isnet_sess.run(None, {'img': img_input})[0][0, 0]
mask_isnet = out_isnet[ph//2:ph//2+h, pw//2:pw//2+w]
mask_isnet = cv2.resize(mask_isnet, (w0, h0))
mask_isnet = np.clip(mask_isnet, 0.0, 1.0)
np.save(os.path.join(OUT_DIR, "mask_isnet.npy"), mask_isnet)
print(f"  Mask shape: {mask_isnet.shape}, mean alpha: {np.mean(mask_isnet):.4f}")

# 2. Anime Face Detection (YOLOv8)
print("Running Python Face Detector...")
face_sess = ort.InferenceSession(r"D:\motionforge\models\anime_face_detect.onnx", providers=['CPUExecutionProvider'])
s_face = 640
img_face_resized = cv2.resize(img_bgr, (s_face, s_face)).astype(np.float32) / 255.0
img_face_input = np.transpose(img_face_resized, (2, 0, 1))[np.newaxis, :]
out_face = face_sess.run(None, {'images': img_face_input})[0]
preds = out_face[0].T if out_face.shape[1] == 5 else out_face[0]

best_box = None
best_conf = 0.0
for p in preds:
    cx, cy, fw, fh, conf = p[:5]
    if conf > 0.45 and conf > best_conf:
        best_conf = conf
        x1 = (cx - fw/2) * (w0 / s_face)
        y1 = (cy - fh/2) * (h0 / s_face)
        x2 = (cx + fw/2) * (w0 / s_face)
        y2 = (cy + fh/2) * (h0 / s_face)
        best_box = [max(0, int(x1)), max(0, int(y1)), min(w0, int(x2)), min(h0, int(y2)), float(conf)]

print(f"  Best Face Box: {best_box}")
with open(os.path.join(OUT_DIR, "face_box.json"), "w") as f:
    json.dump(best_box, f)

# 3. CFA Anime Landmark Detector
print("Running Python CFA Landmarks (ONNX)...")
cfa_sess = ort.InferenceSession(r"D:\motionforge\models\anime_landmarks_cfa.onnx", providers=['CPUExecutionProvider'])
x1, y1, x2, y2, _ = best_box
fw = x2 - x1
fh = y2 - y1
pad_x = int(fw * 0.15)
pad_y = int(fh * 0.15)
cx1 = max(0, x1 - pad_x)
cy1 = max(0, y1 - pad_y)
cx2 = min(w0, x2 + pad_x)
cy2 = min(h0, y2 + pad_y)
crop = img_bgr[cy1:cy2, cx1:cx2]
cw, ch = crop.shape[1], crop.shape[0]

crop_resized = cv2.resize(crop, (128, 128))
crop_rgb = cv2.cvtColor(crop_resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
# Normalize [-1, 1]
crop_norm = (crop_rgb - 0.5) / 0.5
crop_input = np.transpose(crop_norm, (2, 0, 1))[np.newaxis, :]

out_cfa = cfa_sess.run(None, {'input': crop_input})[0][0] # shape (25, 32, 32)
landmarks = []
for i in range(24):
    hm = out_cfa[i]
    min_v, max_v, min_l, max_l = cv2.minMaxLoc(hm)
    lx = cx1 + int(max_l[0] * (cw / 32.0))
    ly = cy1 + int(max_l[1] * (ch / 32.0))
    landmarks.append([int(lx), int(ly), float(max_v)])

print(f"  Extracted {len(landmarks)} landmarks. First 3: {landmarks[:3]}")
with open(os.path.join(OUT_DIR, "landmarks.json"), "w") as f:
    json.dump(landmarks, f)

# 4. Depth Anything V2 Small
print("Running Python Depth Anything V2 Small (ONNX)...")
depth_sess = ort.InferenceSession(r"D:\motionforge\models\depth_anything_v2_small.onnx", providers=['CPUExecutionProvider'])
sd = 518
depth_resized = cv2.resize(img_rgb, (sd, sd)).astype(np.float32) / 255.0
mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
depth_norm = (depth_resized - mean) / std
depth_input = np.transpose(depth_norm, (2, 0, 1))[np.newaxis, :]

out_depth = depth_sess.run(None, {'pixel_values': depth_input})[0][0]
# Resize back to original
depth_map = cv2.resize(out_depth, (w0, h0))
d_min, d_max = depth_map.min(), depth_map.max()
depth_norm_u8 = ((depth_map - d_min) / (d_max - d_min + 1e-8) * 255).astype(np.uint8)
np.save(os.path.join(OUT_DIR, "depth_norm.npy"), depth_norm_u8)
print(f"  Depth map shape: {depth_norm_u8.shape}, mean: {np.mean(depth_norm_u8):.2f}")

print("\nPython Ground Truth Generation Complete!")
