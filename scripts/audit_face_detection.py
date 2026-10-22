import os
import cv2
import numpy as np
import onnxruntime as ort

ROOT = r"D:\motionforge"
MODEL_PATH = os.path.join(ROOT, "models", "anime_face_detect.onnx")
ART_DIR = os.path.join(ROOT, "test-assets", "real", "art")
AUDIT_DIR = os.path.join(ROOT, "test-assets", "results", "audit")
os.makedirs(AUDIT_DIR, exist_ok=True)

# Load YOLOv8 Anime Face ONNX model
print(f"Loading Anime Face Detector from {MODEL_PATH}...")
sess = ort.InferenceSession(MODEL_PATH, providers=['CPUExecutionProvider'])
input_name = sess.get_inputs()[0].name

arts = [
    ("gacha_vera.png", "Vera (Hero Card / Drop)"),
    ("gacha_lucia.png", "Lucia (Card 3 / Secondary)"),
    ("gacha_liv.png", "Liv (Card 1)"),
    ("gacha_alpha_lucia.png", "Alpha & Lucia 4K"),
    ("lyric_selena_capriccio.png", "Selena (Lyric Edit)")
]

def detect_face_yolo(img_bgr, conf_thresh=0.45):
    h0, w0 = img_bgr.shape[:2]
    # YOLOv8 input is 640x640 letterboxed
    target_dim = 640
    scale = min(target_dim / w0, target_dim / h0)
    nw, nh = int(round(w0 * scale)), int(round(h0 * scale))
    resized = cv2.resize(img_bgr, (nw, nh), interpolation=cv2.INTER_LINEAR)
    
    padded = np.zeros((target_dim, target_dim, 3), dtype=np.uint8)
    dx = (target_dim - nw) // 2
    dy = (target_dim - nh) // 2
    padded[dy:dy+nh, dx:dx+nw] = resized
    
    # Preprocess
    blob = padded.astype(np.float32) / 255.0
    blob = blob.transpose(2, 0, 1)[None, ...] # [1, 3, 640, 640]
    
    outputs = sess.run(None, {input_name: blob})
    # YOLOv8 output shape is typically [1, 5, 8400] (cx, cy, w, h, conf)
    out = outputs[0][0] # [5, 8400]
    if out.shape[0] < out.shape[1]:
        out = out.T # [8400, 5]
        
    boxes = []
    confs = []
    for row in out:
        conf = row[4]
        if conf >= conf_thresh:
            cx_box, cy_box, bw, bh = row[0:4]
            # Unpad & unscale
            x1 = (cx_box - bw / 2.0 - dx) / scale
            y1 = (cy_box - bh / 2.0 - dy) / scale
            x2 = (cx_box + bw / 2.0 - dx) / scale
            y2 = (cy_box + bh / 2.0 - dy) / scale
            boxes.append([int(round(x1)), int(round(y1)), int(round(x2)), int(round(y2))])
            confs.append(float(conf))
            
    if not boxes:
        return []
        
    # NMS
    indices = cv2.dnn.NMSBoxes(boxes, confs, conf_thresh, 0.45)
    results = []
    if len(indices) > 0:
        for idx in np.array(indices).flatten():
            i = int(idx)
            x1, y1, x2, y2 = boxes[i]
            x1 = max(0, min(w0 - 1, x1))
            y1 = max(0, min(h0 - 1, y1))
            x2 = max(0, min(w0 - 1, x2))
            y2 = max(0, min(h0 - 1, y2))
            results.append({
                "box": [x1, y1, x2, y2],
                "width": x2 - x1,
                "height": y2 - y1,
                "center": [(x1 + x2) // 2, (y1 + y2) // 2],
                "eyes_center": [(x1 + x2) // 2, int(y1 + (y2 - y1) * 0.38)],
                "confidence": confs[i]
            })
    # Sort by confidence
    results.sort(key=lambda x: x["confidence"], reverse=True)
    return results

print("\n=== ANIME FACE DETECTION AUDIT ===")
detection_report = {}

for filename, desc in arts:
    filepath = os.path.join(ART_DIR, filename)
    img = cv2.imread(filepath)
    if img is None:
        print(f"FAILED TO LOAD: {filepath}")
        continue
    h, w = img.shape[:2]
    faces = detect_face_yolo(img)
    detection_report[filename] = {
        "dimensions": [w, h],
        "faces_found": len(faces),
        "primary_face": faces[0] if faces else None
    }
    
    print(f"\nArt: {filename} ({w}x{h}) - {desc}")
    if faces:
        pf = faces[0]
        b = pf["box"]
        print(f"  [FOUND] Confidence: {pf['confidence']*100:.1f}%")
        print(f"  Face Box: x1={b[0]}, y1={b[1]}, x2={b[2]}, y2={b[3]} (w={pf['width']}, h={pf['height']})")
        print(f"  Face Center: {pf['center']}")
        print(f"  Macro Eyes Center: {pf['eyes_center']}")
        
        # Draw on debug image
        vis = img.copy()
        # Draw green box for face
        cv2.rectangle(vis, (b[0], b[1]), (b[2], b[3]), (0, 255, 0), 6)
        # Draw blue circle on face center
        cv2.circle(vis, tuple(pf["center"]), 16, (255, 0, 0), -1)
        # Draw yellow circle on eyes center
        cv2.circle(vis, tuple(pf["eyes_center"]), 16, (0, 255, 255), -1)
        
        # Label
        lbl = f"FACE {pf['confidence']*100:.1f}%"
        cv2.putText(vis, lbl, (b[0], max(30, b[1] - 15)), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 3)
        
        out_vis = os.path.join(AUDIT_DIR, f"face_detect_{os.path.splitext(filename)[0]}.jpg")
        cv2.imwrite(out_vis, cv2.resize(vis, (int(w * 0.4), int(h * 0.4))))
        print(f"  Saved debug image: {out_vis}")
    else:
        print(f"  [NO FACE DETECTED] Fallback to wide framing required!")

with open(os.path.join(AUDIT_DIR, "face_detection_report.json"), "w", encoding="utf-8") as f:
    import json
    json.dump(detection_report, f, indent=2)

print("\nFace Detection Audit Complete!")
