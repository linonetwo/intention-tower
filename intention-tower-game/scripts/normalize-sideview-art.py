#!/usr/bin/env python3
"""Dependency-free PNG cutting for the GPT Image 2 sideview pack. No API calls."""
import json
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'public/mods/gpt-image-2-pack/sideview'

def load(path):
    data = path.read_bytes()
    pos, compressed = 8, bytearray()
    while pos < len(data):
        size = struct.unpack('>I', data[pos:pos+4])[0]
        tag, chunk = data[pos+4:pos+8], data[pos+8:pos+8+size]
        if tag == b'IHDR':
            w,h,depth,kind,_,_,interlace = struct.unpack('>IIBBBBB',chunk)
        if tag == b'IDAT': compressed.extend(chunk)
        pos += size+12
    assert depth == 8 and kind in (2,6) and not interlace
    channels = 4 if kind == 6 else 3
    raw = zlib.decompress(compressed)
    stride = w*channels
    rows, prior, offset = [], bytearray(stride), 0
    for y in range(h):
        filt = raw[offset]
        row = bytearray(raw[offset+1:offset+1+stride]); offset += stride+1
        for i in range(stride):
            a = row[i-channels] if i >= channels else 0
            b = prior[i]
            c = prior[i-channels] if i >= channels else 0
            if filt == 1: predict = a
            elif filt == 2: predict = b
            elif filt == 3: predict = (a+b)//2
            elif filt == 4:
                p = a+b-c
                pa,pb,pc = abs(p-a),abs(p-b),abs(p-c)
                predict = a if pa <= pb and pa <= pc else b if pb <= pc else c
            else: predict = 0
            row[i] = (row[i]+predict)&255
        rows.append(row); prior=row
    return w,h,channels,rows

def save(path,w,h,channels,rows):
    def chunk(tag,data):
        return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
    body = b''.join(b'\0'+bytes(row) for row in rows)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6 if channels==4 else 2,0,0,0))+chunk(b'IDAT',zlib.compress(body,9))+chunk(b'IEND',b''))

def sheets():
    result = {}
    names = ['idle','walk-1','walk-2','walk-3','walk-4','sit']
    for identity in ['student-male','teacher','researcher']:
        w,h,c,rows = load(ROOT/f'{identity}-sheet.png')
        assert c == 4
        projection = [sum(rows[y][x*4+3]>48 for y in range(h)) for x in range(w)]
        occupied = [x for x,n in enumerate(projection) if n>4]
        groups=[]; start=previous=occupied[0]
        for x in occupied[1:]:
            if x-previous>12:
                groups.append((start,previous+1));start=x
            previous=x
        groups.append((start,previous+1))
        assert len(groups)==6,(identity,groups)
        frames=[]
        canvas_w,canvas_h = 384,724
        atlas = [bytearray(canvas_w*6*4) for _ in range(canvas_h)]
        alpha_min = min(row[i] for row in rows for i in range(3,len(row),4))
        alpha_max = max(row[i] for row in rows for i in range(3,len(row),4))
        for index,(left,right) in enumerate(groups):
            pixels=[(x,y) for y,row in enumerate(rows) for x in range(left,right) if row[x*4+3]>48]
            top,bottom = min(y for x,y in pixels),max(y for x,y in pixels)+1
            # Preserve original body scale. Feet fixed at y=700; horizontal center fixed.
            source_width=right-left
            dx=(canvas_w-source_width)//2
            dy=700-bottom
            output=[bytearray(canvas_w*4) for _ in range(canvas_h)]
            for y in range(top,bottom):
                for x in range(left,right):
                    rgba=rows[y][x*4:x*4+4]
                    # Remove only nearly transparent isolated AI alpha noise.
                    if rgba[3]<8: rgba=bytearray(4)
                    offset=(x-left+dx)*4
                    output[y+dy][offset:offset+4]=rgba
            framepath=ROOT/f'{identity}-{names[index]}.png'
            save(framepath,canvas_w,canvas_h,4,output)
            for y,row in enumerate(output):
                begin=index*canvas_w*4
                atlas[y][begin:begin+len(row)]=row
            frames.append({'name':names[index],'file':framepath.name,'rect':[index*canvas_w,0,canvas_w,canvas_h], 'anchor':[canvas_w/2,700],'sourceBounds':[left,top,right-left,bottom-top]})
        atlaspath=ROOT/f'{identity}-atlas.png'
        save(atlaspath,canvas_w*6,canvas_h,4,atlas)
        result[identity]={'source':f'{identity}-sheet.png','atlas':atlaspath.name,'size':[canvas_w*6,canvas_h],'cellSize':[canvas_w,canvas_h],'anchor':[192,700],'facing':'right','alphaRange':[alpha_min,alpha_max],'frames':frames,'animations':{'idle':[0],'walk':[1,2,3,4],'sit':[5]},'walkFps':7}
        print(identity,groups,'alpha',alpha_min,alpha_max)
    return result

def main():
    result={'schemaVersion':1,'model':'gpt-image-2','generator':'proxy-imagegen','generatedAt':'2026-10-08','provider':'https://token.k3s.onetwo.website/v1','outerModel':'gpt-6.1-sol','artDirection':'bright four-heads anime RPG, orthographic horizontal side view','urlRoot':'/mods/gpt-image-2-pack/sideview/','updatedLevels':['pavlov','gosling','smart-cat','the-wave'],'backgrounds':{},'characters':sheets(),'review':{'reviewedWith':'view_image plus PNG channel validation','rooms':'all three visually inspected: orthographic walls, broad open center, horizontal platform, no characters; small prop top edges still visible','characters':'all three source sheets visually inspected; same identity and costume across six poses; walking contact frames can be similar rather than exact inverse strides; no claim of perfect authored gait','remainingLevels':'seventeen existing background mappings remain unchanged'}}
    # Explicit baselines from visual inspection; render consumers must align these to simulation floor.
    for filename,levels,baseline in [('research-room.png',['pavlov','gosling'],805),('cat-room.png',['smart-cat'],748),('classroom.png',['the-wave'],698)]:
        result['backgrounds'][filename]={'file':filename,'size':[1536,1024],'groundY':baseline,'groundRatio':baseline/1024,'levels':levels,'camera':'orthographic-side-elevation','generatedFloorRatioRequested':0.85}
    result['props']={'chair':{'file':'wood-chair.png','size':[96,200],'anchor':[48,192],'seatY':106,'source':'classroom.png','sourceBounds':[150,504,96,200],'method':'manually reviewed silhouette crop; no new generation','reviewedWith':'view_image'}}
    manifest_path = ROOT/'manifest.json'
    if manifest_path.exists():
        # Re-cutting the original human sheets must not erase later rooms,
        # animal animations or their provenance from the shared manifest.
        existing = json.loads(manifest_path.read_text())
        for section in ['backgrounds', 'characters', 'props']:
            result[section] = {**existing.get(section, {}), **result.get(section, {})}
        result['updatedLevels'] = sorted(set(existing.get('updatedLevels', [])) | set(result['updatedLevels']))
        result['review'] = {**result['review'], **existing.get('review', {})}
        result = {**existing, **result}
    manifest_path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')

def chair():
    """Non-generative extraction of the classroom's left wooden chair."""
    _,_,_,source=load(ROOT/'classroom.png')
    # Hand-reviewed component silhouettes; no wall or floor is carried into alpha.
    polygons=[[(166,514),(175,513),(178,605),(164,605)],
              [(218,514),(230,515),(225,607),(215,607)],
              [(174,514),(218,514),(218,526),(174,524)],
              [(178,535),(184,537),(185,604),(178,604)],
              [(191,533),(197,533),(198,604),(191,604)],
              [(204,531),(211,531),(210,604),(204,604)],
              [(160,603),(232,603),(231,618),(160,618)],
              [(164,618),(176,618),(174,696),(162,696)],
              [(216,618),(227,618),(231,696),(218,696)],
              [(174,662),(218,662),(219,673),(174,673)]]
    def inside(x,y,p):
        yes=False
        for i,(a,b) in enumerate(p):
            c,d=p[i-1]
            if (b>y)!=(d>y) and x<(c-a)*(y-b)/(d-b)+a: yes=not yes
        return yes
    output=[]
    for y in range(504,704):
        row=bytearray(96*4)
        for x in range(150,246):
            if any(inside(x+.5,y+.5,p) for p in polygons):
                begin=(x-150)*4
                row[begin:begin+4]=source[y][x*3:x*3+3]+bytearray([255])
        output.append(row)
    save(ROOT/'wood-chair.png',96,200,4,output)

if __name__ == '__main__':
    main()
    chair()
