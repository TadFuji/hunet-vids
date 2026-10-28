"""Create clearly labelled, synthetic QA clips. No model or network is used."""
import math
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 1280, 720
pixels = bytearray(WIDTH * HEIGHT * 3)
for y in range(HEIGHT):
    for x in range(WIDTH):
        mountain = 350 + 60 * math.sin(x / 130) + 35 * math.sin(x / 70)
        if y < mountain:
            rgb = (20 + y // 20, 46 + y // 20, 45 + y // 25)
        elif y < 485:
            rgb = (22, 59, 46)
        else:
            rgb = (24 + (y % 26 == 0) * 10, 58 + (y % 26 == 0) * 14, 50 + (y % 26 == 0) * 10)
        if (x - 950) ** 2 + (y - 185) ** 2 < 52 ** 2:
            rgb = (161, 185, 147)
        pos = (y * WIDTH + x) * 3
        pixels[pos:pos + 3] = bytes(rgb)

FONT = {
    'A': ['01110','10001','10001','11111','10001','10001','10001'],
    'D': ['11110','10001','10001','10001','10001','10001','11110'],
    'E': ['11111','10000','10000','11110','10000','10000','11111'],
    'G': ['01110','10001','10000','10111','10001','10001','01110'],
    'I': ['11111','00100','00100','00100','00100','00100','11111'],
    'M': ['10001','11011','10101','10101','10001','10001','10001'],
    'N': ['10001','11001','11001','10101','10011','10011','10001'],
    'O': ['01110','10001','10001','10001','10001','10001','01110'],
    'R': ['11110','10001','10001','11110','10100','10010','10001'],
    'T': ['11111','00100','00100','00100','00100','00100','00100'],
    ' ': ['00000'] * 7,
}

def text(value, top, scale):
    left = (WIDTH - len(value) * 6 * scale + scale) // 2
    for index, letter in enumerate(value):
        for row, bits in enumerate(FONT[letter]):
            for col, bit in enumerate(bits):
                if bit == '1':
                    for dy in range(scale):
                        for dx in range(scale):
                            pos = ((top + row * scale + dy) * WIDTH + left + index * 6 * scale + col * scale + dx) * 3
                            pixels[pos:pos + 3] = bytes((205, 235, 208))

text('DEMO', 270, 10)
text('NOT AI GENERATED', 380, 4)
with tempfile.TemporaryDirectory(prefix='omni-demo-') as temp:
    frame = pathlib.Path(temp) / 'frame.ppm'
    frame.write_bytes(f'P6\n{WIDTH} {HEIGHT}\n255\n'.encode() + pixels)
    target = ROOT / 'test/fixtures/demo-40.mp4'
    target.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-loop','1','-framerate','12','-i',str(frame),'-t','40','-vf',"zoompan=z='1.03+0.02*sin(on/48)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=1280x720:fps=12",'-an','-c:v','libx264','-g','12','-preset','ultrafast','-crf','30','-pix_fmt','yuv420p','-movflags','+faststart',str(target)],check=True)
    for seconds in [10,20,30]:
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(target),'-t',str(seconds),'-c','copy','-movflags','+faststart',str(ROOT / f'test/fixtures/demo-{seconds}.mp4')],check=True)
print('Synthetic 10/20/30/40-second demo videos created.')
