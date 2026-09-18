from pathlib import Path
import urllib.request, json
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.pagesizes import A4
ROOT=Path(__file__).resolve().parents[1]
ids=list(range(100,135))+list(range(10,26))
def fetch(i):
 p=ROOT/f'assets/apriltags/tag36_11_{i:05d}.png'
 if not p.exists(): urllib.request.urlretrieve(f'https://raw.githubusercontent.com/AprilRobotics/apriltag-imgs/master/tag36h11/tag36_11_{i:05d}.png',p)
 return i,Image.open(p).convert('L')
imgs=dict(ThreadPoolExecutor(8).map(fetch,ids))
c=canvas.Canvas(str(ROOT/'output/pdf/ar-tracker-print-kit.pdf'),pagesize=A4)
c.setTitle('Tangible AR | A4 tracker print kit')
manifest={'family':'tag36h11','paper_mm':[210,297],'print_scale':1,'marker_size_definition':'Outer edge of black square, excluding white margin','field_coordinate_system':'mm from page bottom-left; +x right, +y up; markers upright as printed','markers':[]}
def text(x,y,s,size=9,bold=False):
 c.setFillGray(0);c.setFont('Helvetica-Bold' if bold else 'Helvetica',size);c.drawString(x*mm,y*mm,s)
def line(x1,y1,x2,y2,dash=False,gray=.5):
 c.setStrokeGray(gray);c.setLineWidth(.45);c.setDash(2,2) if dash else c.setDash();c.line(x1*mm,y1*mm,x2*mm,y2*mm);c.setDash()
def tag(i,x,y,size,label):
 im=imgs[i];assert im.size==(10,10)
 cell=size/8
 c.setFillGray(1);c.rect((x-cell)*mm,(y-cell)*mm,10*cell*mm,10*cell*mm,fill=1,stroke=0)
 # Cancel shared cell edges, then fill the resulting outlines in one operation.
 # Integer grid vertices guarantee exact joins, without PDF cell seams.
 edges=set()
 for r in range(10):
  for col in range(10):
   if im.getpixel((col,r))>=128:continue
   vertices=[(col-1,8-r),(col,8-r),(col,9-r),(col-1,9-r)]
   for start,end in zip(vertices,vertices[1:]+vertices[:1]):
    if (end,start) in edges:edges.remove((end,start))
    else:edges.add((start,end))
 path=c.beginPath()
 while edges:
  start,end=min(edges);edges.remove((start,end))
  path.moveTo((x+start[0]*cell)*mm,(y+start[1]*cell)*mm)
  while end!=start:
   path.lineTo((x+end[0]*cell)*mm,(y+end[1]*cell)*mm)
   following=min(edge for edge in edges if edge[0]==end)
   edges.remove(following);end=following[1]
  path.close()
 c.setFillGray(0);c.drawPath(path,stroke=0,fill=1,fillMode=1)
 manifest['markers'].append({'label':label,'id':i,'black_square_mm':size,'page':page,'center_page_mm':[x+size/2,y+size/2]})
def header(n,title,sub):
 text(12,281,'TANGIBLE AR  /  PRINT KIT',9,True);text(12,269,title,22,True);text(12,260,sub,9)
 text(188,281,f'0{n}',11,True)
def footer():
 text(12,11,'A4 | Print at 100% / Actual size | Single-sided | Keep white borders clear',8)
 line(148,20,198,20,gray=0);line(148,18,148,22,gray=0);line(198,18,198,22,gray=0);text(156,23,'50 mm print check',8)
page=1
# Full-sheet 5 x 7 board: 30 mm black squares on a 40 mm pitch.
# Unique field IDs do not overlap the movable or cube markers.
for row in range(7):
 for col in range(5):
  i=100+row*5+col
  tag(i,10+40*col,253.5-40*row,30,f'Field {i}')
manifest['field']={'columns':5,'rows':7,'pitch_mm':40,'black_square_mm':30,'ids':'100-134, row-major from top-left','note':'Use the saved marker centers as one rigid board; visible tags can anchor the field when other tags are occluded.'}
c.showPage()
page=2
header(2,'Ten movable pieces','Cut around each pale outline. Keep the full white margin with each tag.')
for i in range(10):
 col=i%2;row=i//2;x=23+col*88;y=218-row*44
 c.setStrokeGray(.7);c.setLineWidth(.4);c.rect((x-6)*mm,(y-10)*mm,76*mm,43*mm,stroke=1,fill=0)
 tag(10+i,x+22,y,24, 'Tag '+chr(65+i))
 text(x+21,y-7,'Tag '+chr(65+i),10,True);text(x+47,y-7,f'ID {10+i}',7)
text(12,27,'Family: tag36h11  |  Each black square: 24 mm  |  IDs 10-19',8)
footer();c.showPage()
page=3
header(3,'Build a tracking cube','Cut solid lines. Fold dashed lines inward; glue tabs inside with tags facing out.')
# A cross net: four faces in a column, two wings on the second face.
S=50;ox=80;oy=40
faces={(1,0):('Cube 6',25),(1,1):('Cube 5',24),(1,2):('Cube 2',21),(1,3):('Cube 1',20),(0,2):('Cube 3',22),(2,2):('Cube 4',23)}
# Seven glue tabs, one per paired seam; no tabs overlap in the flat net.
tabs={((1,3),'T'),((1,3),'L'),((1,3),'R'),((1,1),'L'),((1,1),'R'),((1,0),'L'),((1,0),'R')}
for (gx,gy),(label,i) in faces.items():
 x=ox+(gx-1)*S;y=oy+gy*S
 tag(i,x+9,y+11,32,label);text(x+12,y+4,f'{label}  |  ID {i}',8)
 edges={'B':((x,y),(x+S,y),(gx,gy-1),(0,-1)), 'T':((x,y+S),(x+S,y+S),(gx,gy+1),(0,1)), 'L':((x,y),(x,y+S),(gx-1,gy),(-1,0)), 'R':((x+S,y),(x+S,y+S),(gx+1,gy),(1,0))}
 for side,(a,b,neighbor,normal) in edges.items():
  if neighbor in faces:
   if side in ('T','R'):line(*a,*b,True)
  elif ((gx,gy),side) in tabs:
   line(*a,*b,True)
   dx=(b[0]-a[0])/S;dy=(b[1]-a[1])/S
   q=(a[0]+dx*6+normal[0]*7,a[1]+dy*6+normal[1]*7)
   r=(b[0]-dx*6+normal[0]*7,b[1]-dy*6+normal[1]*7)
   line(*a,*q);line(*q,*r);line(*r,*b)
  else:line(*a,*b)
text(12,30,'50 mm cube faces | 32 mm black squares | IDs 20-25 | Matte card works best',8)
footer();c.showPage();c.save()
manifest['cube']={'edge_mm':50,'net_grid_faces':{label:{'id':i,'column':gx,'row_from_bottom':gy} for (gx,gy),(label,i) in faces.items()},'note':'All markers upright in the flat net. Derive rigid face transforms from this net when implementing cube tracking.'}
(ROOT/'assets/apriltags/marker-manifest.json').write_text(json.dumps(manifest,indent=2))
print('Created PDF and manifest')
