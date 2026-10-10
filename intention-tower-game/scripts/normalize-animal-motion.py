#!/usr/bin/env python3
"""Cut generated transparent animal sheets; preserve all model-painted pixels."""
import importlib.util
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1] / 'public/mods/gpt-image-2-pack/sideview'
spec = importlib.util.spec_from_file_location('normalize', Path(__file__).with_name('normalize-sideview-art.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
names = ['idle', 'walk-1', 'walk-2', 'walk-3', 'walk-4', 'sit']

def cut(identity):
    w,h,c,rows = module.load(ROOT/f'animals/{identity}-sheet.png')
    assert c == 4, (identity, 'source must have true alpha')
    projection = [sum(rows[y][x*4+3]>48 for y in range(h)) for x in range(w)]
    occupied = [x for x,n in enumerate(projection) if n>4]
    groups=[]
    start=previous=occupied[0]
    for x in occupied[1:]:
        if x-previous>12:
            groups.append((start,previous+1)); start=x
        previous=x
    groups.append((start,previous+1))
    assert len(groups)==6, (identity, groups)
    bounds=[]
    for left,right in groups:
        ys=[y for y in range(h) if any(rows[y][x*4+3]>48 for x in range(left,right))]
        bounds.append((left,min(ys),right,max(ys)+1))
    cw=max(r-l for l,t,r,b in bounds)+32
    ch=max(b-t for l,t,r,b in bounds)+24
    anchor=[cw/2,ch-12]
    atlas=[bytearray(cw*6*4) for _ in range(ch)]
    frames=[]
    for index,(left,top,right,bottom) in enumerate(bounds):
        output=[bytearray(cw*4) for _ in range(ch)]
        dx=(cw-(right-left))//2
        dy=ch-12-bottom
        for y in range(top,bottom):
            for x in range(left,right):
                rgba=rows[y][x*4:x*4+4]
                if rgba[3]<8: rgba=bytearray(4)
                offset=(x-left+dx)*4
                output[y+dy][offset:offset+4]=rgba
        filename=f'animals/{identity}-{names[index]}.png'
        module.save(ROOT/filename,cw,ch,4,output)
        for y,row in enumerate(output):
            atlas[y][index*cw*4:(index+1)*cw*4]=row
        frames.append({'name':names[index],'file':filename,'rect':[index*cw,0,cw,ch],'anchor':anchor,'sourceBounds':[left,top,right-left,bottom-top]})
    module.save(ROOT/f'animals/{identity}-atlas.png',cw*6,ch,4,atlas)
    # Compact non-generative nearest-neighbor review copy of the six model frames.
    tw=720
    th=round(ch*tw/(cw*6))
    preview=[bytearray(tw*4) for _ in range(th)]
    for y in range(th):
        for x in range(tw):
            sx=min(cw*6-1,int(x*cw*6/tw)); sy=min(ch-1,int(y*ch/th))
            preview[y][x*4:x*4+4]=atlas[sy][sx*4:sx*4+4]
    module.save(ROOT/f'animals/{identity}-review.png',tw,th,4,preview)
    return {'source':f'animals/{identity}-sheet.png','atlas':f'animals/{identity}-atlas.png','size':[cw*6,ch],'cellSize':[cw,ch],'anchor':anchor,'facing':'right','alphaRange':[min(row[i] for row in rows for i in range(3,len(row),4)),max(row[i] for row in rows for i in range(3,len(row),4))],'frames':frames,'animations':{'idle':[0],'walk':[1,2,3,4],'sit':[5]},'walkFps':7}

def patch_manifest(path,field,new):
    current=json.loads(path.read_text())
    current[field].update(new)
    # apply_patch preserves unrelated field contents and concurrent background edits.
    old=path.read_text()
    updated=json.dumps(current,ensure_ascii=False,indent=2)+'\n'
    import difflib
    diff=list(difflib.unified_diff(old.splitlines(),updated.splitlines(),n=3))
    patch='*** Begin Patch\n*** Update File: '+str(path)+'\n'+'\n'.join(line if not line.startswith('@@') else '@@' for line in diff[2:])+'\n*** End Patch\n'
    print(patch)

if __name__=='__main__':
    characters={name:cut(name) for name in ['cat','dog','gosling']}
    patch_manifest(ROOT/'manifest.json','characters',characters)
    manifestpath=ROOT.parent/'manifest.json'
    root=json.loads(manifestpath.read_text())
    updates={}
    for name,character in characters.items():
        prototype='/mods/gpt-image-2-pack/sprites/'+name+'.png'
        prefix='/mods/gpt-image-2-pack/sideview/animals/'+name
        for key,entry in root['spritesByCharacter'].items():
            if entry.get('src')==prototype:
                updates[key]={**entry,'src':prefix+'-idle.png','groundAnchor':character['anchor'][1]/character['cellSize'][1],'walkFrames':[prefix+f'-walk-{i}.png' for i in range(1,5)],'sittingSrc':prefix+'-sit.png'}
                updates[key].pop('chairSrc',None)
    patch_manifest(manifestpath,'spritesByCharacter',updates)
