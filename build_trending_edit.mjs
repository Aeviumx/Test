import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = 'D:/motionforge/public/assets';
const SEGS_DIR = path.join(OUT_DIR, 'edit_segments');
if (!fs.existsSync(SEGS_DIR)) fs.mkdirSync(SEGS_DIR, { recursive: true });

const AUDIO_PATH = path.join(OUT_DIR, 'trending_audio.aac');
const STAGE_IMG = path.join(OUT_DIR, 'intro_stage.png');
const TWIXTOR_VIDEO = path.join(OUT_DIR, 'raw_clips/acheron_twixtor.mp4');
const ULT_VIDEO = path.join(OUT_DIR, 'raw_clips/acheron_ult.mp4');
const KAFKA_IMG = path.join(OUT_DIR, 'characters/kafka_portrait.png');
const FIREFLY_IMG = path.join(OUT_DIR, 'characters/firefly_portrait.png');
const FINAL_MP4 = path.join(OUT_DIR, 'trending_character_edit.mp4');

function run(cmd, desc) {
  console.log(`\n>>> [${desc}]`);
  execSync(cmd, { stdio: 'inherit' });
}

// Consistent anime CC: contrast, saturation, unsharp mask, vignette + strict SAR/colorspace
const POST = "setsar=1,eq=contrast=1.18:saturation=1.22:brightness=-0.02,unsharp=5:5:0.6:5:5:0.0,vignette=PI/4,format=yuv420p";
const ENC = "-c:v libx264 -preset veryfast -crf 18 -colorspace bt709 -color_primaries bt709 -color_trc bt709 -pix_fmt yuv420p -an -y";

console.log('=== Step 1: Render All Segments ===');

// Seg 0A: Kafka Teaser (0.00s - 0.35s = 0.35s)
const seg0a = path.join(SEGS_DIR, 'seg0a_kafka.mp4');
run(`ffmpeg -loop 1 -i "${KAFKA_IMG}" -vf "fps=60,scale=1400:1400,crop=1080:1080:(in_w-1080)/2:(in_h-1080)/2-100,zoompan=z='1.15-0.15*(in/21)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=21:s=1080x1080:fps=60,drawbox=color=white@0.85:t=fill:enable='between(t\\,0\\,0.066)',${POST}" -t 0.35 ${ENC} "${seg0a}"`, 'Seg 0A (Kafka Teaser)');

// Seg 0B: Firefly Teaser (0.35s - 0.70s = 0.35s)
const seg0b = path.join(SEGS_DIR, 'seg0b_firefly.mp4');
run(`ffmpeg -loop 1 -i "${FIREFLY_IMG}" -vf "fps=60,scale=1400:1400,crop=1080:1080:(in_w-1080)/2:(in_h-1080)/2-120,zoompan=z='1.15-0.15*(in/21)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=21:s=1080x1080:fps=60,drawbox=color=white@0.85:t=fill:enable='between(t\\,0\\,0.066)',${POST}" -t 0.35 ${ENC} "${seg0b}"`, 'Seg 0B (Firefly Teaser)');

// Seg 1: 3-Card Stage Pan (0.70s - 2.40s = 1.70s)
const seg1 = path.join(SEGS_DIR, 'seg1_stage_pan.mp4');
const panExpr = `if(lt(t\\,0.6)\\, 400 + 660*(0.5-0.5*cos(PI*t/0.6))\\, if(lt(t\\,1.1)\\, 1060 + 660*(0.5-0.5*cos(PI*(t-0.6)/0.5))\\, 1720 - 660*(0.5-0.5*cos(PI*(t-1.1)/0.6))))`;
run(`ffmpeg -loop 1 -i "${STAGE_IMG}" -vf "fps=60,crop=1080:1080:'${panExpr}':0,setsar=1,format=yuv420p" -t 1.70 ${ENC} "${seg1}"`, 'Seg 1 (3-Card Stage Pan)');

// Seg 2: Selection & 360 Spin Zoom (2.40s - 3.86s = 1.46s)
const seg2 = path.join(SEGS_DIR, 'seg2_spin_zoom.mp4');
run(`ffmpeg -loop 1 -i "${STAGE_IMG}" -vf "fps=60,crop=1080:1080:1060:0,zoompan=z='if(lt(in\\,48)\\, 1.0 + 1.4*(in/48)\\, 2.4 + 0.6*((in-48)/40))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=88:s=1080x1080:fps=60,rotate='if(lt(t\\,0.8)\\, 0\\, 2*PI*pow((t-0.8)/0.66\\, 1.8))':ow=1080:oh=1080:c=white,drawbox=color=white@0.7:t=fill:enable='between(t\\,1.05\\,1.10)+between(t\\,1.30\\,1.35)',setsar=1,format=yuv420p" -t 1.46 ${ENC} "${seg2}"`, 'Seg 2 (Spin Zoom to Drop)');

// Cut 1: Drop Hit (3.86s - 4.35s = 0.49s)
const cut1 = path.join(SEGS_DIR, 'cut1_drop.mp4');
const shakeX = "'(iw-1080)/2 + if(lt(t\\,0.35)\\, 24*exp(-t*12)*sin(t*50)\\, 0)'";
const shakeY = "'(ih-1080)/2 + if(lt(t\\,0.35)\\, 16*exp(-t*12)*cos(t*55)\\, 0)'";
run(`ffmpeg -ss 0.65 -i "${TWIXTOR_VIDEO}" -vf "fps=60,scale=-1:1140,crop=1080:1080:${shakeX}:${shakeY},zoompan=z='1.15-0.12*(in/29)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=29:s=1080x1080:fps=60,drawbox=color=white@0.9:t=fill:enable='between(t\\,0\\,0.066)',${POST}" -t 0.49 ${ENC} "${cut1}"`, 'Cut 1 (The Drop)');

// Cut 2: Close-up Glowing Eyes (4.35s - 5.45s = 1.10s)
const cut2 = path.join(SEGS_DIR, 'cut2_eyes.mp4');
const driftX = "'(iw-1080)/2 + 25*sin(t*2)'";
run(`ffmpeg -ss 3.80 -i "${TWIXTOR_VIDEO}" -vf "fps=60,scale=-1:1120,crop=1080:1080:${driftX}:(ih-1080)/2,zoompan=z='1.25-0.18*(in/66)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=66:s=1080x1080:fps=60,drawbox=color=white@0.8:t=fill:enable='between(t\\,0\\,0.05)',${POST}" -t 1.10 ${ENC} "${cut2}"`, 'Cut 2 (Glowing Eyes)');

// Cut 3: Floating Kimono Walk in Wind (5.45s - 6.93s = 1.48s)
const cut3 = path.join(SEGS_DIR, 'cut3_kimono.mp4');
const whipX = "'(iw-1080)/2 + 80*exp(-t*8)'";
run(`ffmpeg -ss 8.20 -i "${TWIXTOR_VIDEO}" -vf "fps=60,scale=-1:1140,crop=1080:1080:${whipX}:(ih-1080)/2,zoompan=z='1.12-0.08*(in/89)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=89:s=1080x1080:fps=60,drawbox=color=white@0.7:t=fill:enable='between(t\\,0\\,0.05)',${POST}" -t 1.48 ${ENC} "${cut3}"`, 'Cut 3 (Floating Kimono)');

// Cut 4: Lipstick Brush Smile (6.93s - 7.50s = 0.57s)
const cut4 = path.join(SEGS_DIR, 'cut4_lips.mp4');
run(`ffmpeg -ss 19.30 -i "${TWIXTOR_VIDEO}" -vf "fps=60,scale=-1:1100,crop=1080:1080:(iw-1080)/2:(ih-1080)/2,zoompan=z='1.18-0.18*(in/34)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=34:s=1080x1080:fps=60,drawbox=color=white@0.75:t=fill:enable='between(t\\,0\\,0.05)',${POST}" -t 0.57 ${ENC} "${cut4}"`, 'Cut 4 (Lipstick Smile)');

// Cut 5: Blood Moon Silhouette (7.50s - 8.55s = 1.05s)
const cut5 = path.join(SEGS_DIR, 'cut5_moon.mp4');
run(`ffmpeg -ss 12.90 -i "${TWIXTOR_VIDEO}" -vf "fps=60,scale=-1:1120,crop=1080:1080:(iw-1080)/2:(ih-1080)/2,rotate='-0.05*exp(-t*4)':ow=1080:oh=1080:c=black,drawbox=color=#8b0024@0.6:t=fill:enable='between(t\\,0\\,0.06)',${POST}" -t 1.05 ${ENC} "${cut5}"`, 'Cut 5 (Blood Moon Silhouette)');

// Cut 6: Slashed Dream Shockwave Explosion (8.55s - 9.61s = 1.06s)
const cut6 = path.join(SEGS_DIR, 'cut6_shatter.mp4');
const shake6X = "'(iw-1080)/2 + if(lt(t\\,0.4)\\, 28*exp(-t*10)*sin(t*45)\\, 0)'";
const shake6Y = "'(ih-1080)/2 + if(lt(t\\,0.4)\\, 18*exp(-t*10)*cos(t*50)\\, 0)'";
run(`ffmpeg -ss 24.20 -i "${ULT_VIDEO}" -vf "fps=60,scale=-1:1180,crop=1080:1080:${shake6X}:${shake6Y},zoompan=z='1.20-0.15*(in/64)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=64:s=1080x1080:fps=60,drawbox=color=white@0.95:t=fill:enable='between(t\\,0\\,0.05)',${POST}" -t 1.06 ${ENC} "${cut6}"`, 'Cut 6 (Shockwave Explosion)');

// Cut 7: Umbrella Turn in Dark Rain (9.61s - 11.10s = 1.49s)
const cut7 = path.join(SEGS_DIR, 'cut7_umbrella.mp4');
run(`ffmpeg -ss 1.80 -i "${TWIXTOR_VIDEO}" -vf "fps=60,scale=-1:1120,crop=1080:1080:(iw-1080)/2:(ih-1080)/2,zoompan=z='1.12-0.10*(in/89)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=89:s=1080x1080:fps=60,drawbox=color=white@0.8:t=fill:enable='between(t\\,0\\,0.05)',${POST}" -t 1.49 ${ENC} "${cut7}"`, 'Cut 7 (Umbrella in Rain)');

// Cut 8: Intense Head Tilt Looking Up (11.10s - 11.66s = 0.56s)
const cut8 = path.join(SEGS_DIR, 'cut8_gaze.mp4');
run(`ffmpeg -ss 6.20 -i "${TWIXTOR_VIDEO}" -vf "fps=60,scale=-1:1100,crop=1080:1080:(iw-1080)/2:(ih-1080)/2,zoompan=z='1.20-0.18*(in/34)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=34:s=1080x1080:fps=60,drawbox=color=white@0.85:t=fill:enable='between(t\\,0\\,0.05)',${POST}" -t 0.56 ${ENC} "${cut8}"`, 'Cut 8 (Head Tilt Looking Up)');

// Cut 9: Mirror Snap & Glint (11.66s - 12.71s = 1.05s)
const cut9 = path.join(SEGS_DIR, 'cut9_mirror.mp4');
run(`ffmpeg -ss 26.50 -i "${TWIXTOR_VIDEO}" -vf "fps=60,scale=-1:1120,crop=1080:1080:(iw-1080)/2:(ih-1080)/2,drawbox=color=white@0.9:t=fill:enable='between(t\\,0\\,0.04)+between(t\\,0.28\\,0.32)',${POST}" -t 1.05 ${ENC} "${cut9}"`, 'Cut 9 (Mirror Snap Glint)');

// Cut 10: Final Direct Gaze & Beat Fade Out (12.71s - 13.51s = 0.80s)
const cut10 = path.join(SEGS_DIR, 'cut10_climax.mp4');
run(`ffmpeg -ss 9.80 -i "${TWIXTOR_VIDEO}" -vf "fps=60,scale=-1:1100,crop=1080:1080:(iw-1080)/2:(ih-1080)/2,zoompan=z='1.08-0.08*(in/48)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=48:s=1080x1080:fps=60,drawbox=color=white@0.75:t=fill:enable='between(t\\,0\\,0.05)',fade=t=out:st=0.65:d=0.15,${POST}" -t 0.80 ${ENC} "${cut10}"`, 'Cut 10 (Final Climax & Fade)');

console.log('=== Step 2: Seamless Filter-Complex Concat with Exact Audio ===');

const segs = [seg0a, seg0b, seg1, seg2, cut1, cut2, cut3, cut4, cut5, cut6, cut7, cut8, cut9, cut10];
const inputs = segs.map(s => `-i "${s}"`).join(' ');
const streamTags = segs.map((_, i) => `[${i}:v]`).join('');
const filterComplex = `"${streamTags}concat=n=${segs.length}:v=1:a=0[v]"`;

run(`ffmpeg ${inputs} -i "${AUDIO_PATH}" -filter_complex ${filterComplex} -map "[v]" -map ${segs.length}:a -c:v libx264 -preset fast -crf 17 -colorspace bt709 -color_primaries bt709 -color_trc bt709 -c:a aac -b:a 256k -shortest -y "${FINAL_MP4}"`, 'Concat Segments and Mux Master Audio');

console.log(`\n🎉 MASTER EDIT READY: ${FINAL_MP4}`);
