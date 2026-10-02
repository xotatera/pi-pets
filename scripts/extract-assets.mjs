import { spawnSync } from 'node:child_process';

// Development only: runtime uses the already bundled PNG frames.
const script = String.raw`
import json, pathlib, sys, zipfile, stat, hashlib
source, target = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
counts = dict(idle=6, running=6, waiting=6, review=6, failed=8, jumping=5, waving=4)
with zipfile.ZipFile(source) as z:
    for info in z.infolist():
        p = pathlib.PurePosixPath(info.filename)
        if p.is_absolute() or '..' in p.parts or '\\' in info.filename or stat.S_ISLNK(info.external_attr >> 16):
            raise ValueError('unsafe ZIP path')
    manifest = {state: [f'{state}/{i:02}.png' for i in range(count)] for state, count in counts.items()}
    frames = {}
    for paths in manifest.values():
        for path in paths:
            info = z.getinfo('frames/' + path)
            if not 0 < info.file_size <= 1024 * 1024:
                raise ValueError('invalid frame size')
            data = z.read(info)
            if not data.startswith(b'\x89PNG\r\n\x1a\n'):
                raise ValueError('invalid PNG frame')
            frames[path] = data
    target.mkdir(parents=True, exist_ok=True)
    if target.is_symlink():
        raise ValueError('unsafe output directory')
    for path, data in frames.items():
        output = target / path
        output.parent.mkdir(exist_ok=True)
        if output.parent.is_symlink() or output.is_symlink():
            raise ValueError('unsafe output path')
        output.write_bytes(data)
    manifest_path = target / 'manifest.json'
    if manifest_path.is_symlink():
        raise ValueError('unsafe manifest path')
    manifest['sha256'] = {path: hashlib.sha256(data).hexdigest() for path, data in frames.items()}
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
print('Extracted', len(frames), 'Pi frames')
`;
const result = spawnSync('python3', ['-c', script, process.argv[2] ?? 'Pi-export.zip', process.argv[3] ?? 'assets'], { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
