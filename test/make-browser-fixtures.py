"""Private synthetic fixtures only; never publish these files or run paid APIs."""
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parent / 'fixtures'
root.mkdir(exist_ok=True)
def create(name, duration, size, pattern, audio=False, frequency=440):
    video = f'{pattern}=size={size}:rate=24' if pattern == 'testsrc2' else f'{pattern}:s={size}:r=24'
    cmd = ['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y','-f','lavfi','-i',video]
    if audio: cmd += ['-f','lavfi','-i',f'sine=frequency={frequency}:sample_rate=48000']
    cmd += ['-t',str(duration),'-c:v','libx264','-preset','ultrafast','-crf','28','-pix_fmt','yuv420p','-threads','2']
    if audio: cmd += ['-c:a','aac','-b:a','96k']
    subprocess.run(cmd + ['-movflags','+faststart',str(root/name)],check=True)
create('wasm-source60.mp4',60,'640x360','testsrc2',True)
create('wasm-ending20.mp4',20,'640x360','color=c=blue',True)
create('wasm-portrait12.mp4',12,'360x640','color=c=green')
create('wasm-ending13.mp4',13,'640x360','color=c=red')
create('wasm-portrait-ending13.mp4',13,'360x640','color=c=yellow',True,880)
create('wasm-720p12.mp4',12,'1280x720','testsrc2')
subprocess.run(['ffmpeg','-v','error','-nostdin','-y','-display_rotation:v:0','90','-i',str(root/'wasm-ending20.mp4'),'-c','copy',str(root/'wasm-rotated20.mp4')],check=True)
print('Private synthetic fixtures prepared.')
