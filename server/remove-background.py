"""Process extracted video frames locally; one reused ONNX session per clip."""
import os, sys, json
from pathlib import Path
os.environ.setdefault('OMP_NUM_THREADS', '4')
os.environ.setdefault('U2NET_HOME', str(Path(__file__).resolve().parents[1] / 'data/models'))
from rembg import remove, new_session
from PIL import Image

MODEL_ALIASES = {
    'human': 'u2net_human_seg',
    'fast': 'u2netp',
    'ai': 'u2netp',
}

def resolve_model(value):
    return MODEL_ALIASES.get(value, value)

if sys.argv[1:2] == ['--setup']:
    model = resolve_model(sys.argv[2] if len(sys.argv) > 2 else 'human')
    new_session(model, providers=['CPUExecutionProvider'])
    print(f'Local background removal ready ({model})', flush=True)
    sys.exit(0)

model = resolve_model(os.environ.get('REEL_MAKER_BG_MODEL', 'human'))
session = new_session(model, providers=['CPUExecutionProvider'])
source, dest = map(Path, sys.argv[1:3]); dest.mkdir(exist_ok=True, parents=True)
frames = sorted(source.glob('*.png'))
for index, frame in enumerate(frames):
    with Image.open(frame) as image:
        result = remove(image.convert('RGB'), session=session)
        result.save(dest / frame.name)
    print(json.dumps({'frame': index+1, 'total':len(frames)}), flush=True)
