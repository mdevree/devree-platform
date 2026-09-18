#!/usr/bin/env python3
"""Split the approved combined recording only if all ten deliberate pauses exist."""
import hashlib,json,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]/'pbx/reception'
source=root/'audio/additional-source.mp3'
prompts=json.loads((root/'prompts.json').read_text())
names=[n for n in prompts if n not in ('main','number')]
result=subprocess.run(['ffmpeg','-hide_banner','-i',str(source),'-af','silencedetect=noise=-40dB:d=2','-f','null','-'],capture_output=True,text=True,check=True)
starts=[float(x) for x in re.findall(r'silence_start: ([\d.]+)',result.stderr)]
ends=[float(x) for x in re.findall(r'silence_end: ([\d.]+)',result.stderr)]
if len(starts)!=len(names)-1 or len(ends)!=len(starts):raise RuntimeError('Pause count differs; inspect recording before splitting')
duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(source)],text=True))
manifest=[]
for i,name in enumerate(names):
 start=max(0,ends[i-1]-.15) if i else 0
 end=min(duration,starts[i]+.25) if i<len(starts) else duration
 target=root/'audio'/f'{name}.wav'
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(start),'-i',str(source),'-t',str(end-start),'-ar','8000','-ac','1','-c:a','pcm_s16le',str(target)],check=True)
 manifest.append(dict(name=name,start=start,end=end,text=prompts[name],sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
(root/'audio/segments.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(f'Created {len(manifest)} telephone clips; source duration {duration:.2f}s; ten pauses verified.')
