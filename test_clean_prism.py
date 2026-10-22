import numpy as np
from PIL import Image

def clean_spectral_prism(arr, strength=14.0):
    if strength <= 0.8:
        return arr
    s = float(strength)
    h, w, _ = arr.shape
    res = np.zeros_like(arr)
    
    # Red: radial expansion
    im_r = Image.fromarray(arr[:, :, 0])
    im_r_scaled = im_r.resize((int(w + s * 2), int(h + s * 2)), Image.Resampling.BILINEAR)
    res[:, :, 0] = np.array(im_r_scaled.crop((int(s), int(s), int(s) + w, int(s) + h)))
    
    # Green: baseline
    res[:, :, 1] = arr[:, :, 1]
    
    # Blue: radial contraction by cropping outer s pixels and resizing to (w, h)
    im_b = Image.fromarray(arr[:, :, 2])
    im_b_cropped = im_b.crop((int(s), int(s), int(w - s), int(h - s)))
    res[:, :, 2] = np.array(im_b_cropped.resize((w, h), Image.Resampling.BILINEAR))
    
    return res

test_im = Image.open('D:/motionforge/public/assets/gacha_vera.png').convert('RGB').resize((1080, 1080))
res_clean = clean_spectral_prism(np.array(test_im), 18.0)
Image.fromarray(res_clean).save('C:/Users/mi7ki/.gemini/antigravity/brain/dcf0ddcd-0da4-4c20-ad76-55a82e55d8ae/clean_prism_test.jpg')
print("Clean prism test saved successfully!")
