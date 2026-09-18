// All ground coordinates are millimetres: x right, z toward the bottom of the sheet.
export function project(h, x, z) {
  const w = h[6] * x + h[7] * z + h[8];
  return [(h[0] * x + h[1] * z + h[2]) / w, (h[3] * x + h[4] * z + h[5]) / w];
}
export function invert3(m) {
  const [a,b,c,d,e,f,g,h,i] = m;
  const out = [e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
  const det = a*out[0]+b*out[3]+c*out[6];
  return Math.abs(det) < 1e-12 ? null : out.map(n => n/det);
}
function solve(a,b) {
  const n = b.length, rows = a.map((r,i) => [...r,b[i]]);
  for (let col=0; col<n; col++) {
    let pivot=col;
    for(let row=col+1;row<n;row++) if(Math.abs(rows[row][col])>Math.abs(rows[pivot][col])) pivot=row;
    if(Math.abs(rows[pivot][col])<1e-10) return null;
    [rows[col],rows[pivot]]=[rows[pivot],rows[col]];
    const k=rows[col][col];for(let j=col;j<=n;j++) rows[col][j]/=k;
    for(let row=0;row<n;row++) if(row!==col) {
      const f=rows[row][col];for(let j=col;j<=n;j++) rows[row][j]-=f*rows[col][j];
    }
  }
  return rows.map(r=>r[n]);
}
export function fitHomography(pairs) {
  if(pairs.length<4) return null;
  // Scale source and image coordinates for a well-conditioned least-squares solve.
  const a=Array.from({length:8},()=>Array(8).fill(0)), b=Array(8).fill(0);
  for(const {world:[wx,wz],image:[ix,iy]} of pairs) {
    const x=wx/100,z=wz/100,u=ix/1000,v=iy/1000;
    const rows=[[x,z,1,0,0,0,-u*x,-u*z],[0,0,0,x,z,1,-v*x,-v*z]];
    for(let r=0;r<2;r++) for(let i=0;i<8;i++) {
      b[i]+=rows[r][i]*(r?v:u);
      for(let j=0;j<8;j++) a[i][j]+=rows[r][i]*rows[r][j];
    }
  }
  const h=solve(a,b); if(!h) return null;
  return [h[0]*10,h[1]*10,h[2]*1000,h[3]*10,h[4]*10,h[5]*1000,h[6]/100,h[7]/100,1];
}
export function tagPairs(tag, marker) {
  const x=marker.center_page_mm[0]-105,z=148.5-marker.center_page_mm[1],s=marker.black_square_mm/2;
  // AprilTag C corner order: bottom-left, bottom-right, top-right, top-left.
  const world=[[x-s,z+s],[x+s,z+s],[x+s,z-s],[x-s,z-s]];
  return world.map((point,i)=>({world:point,image:[tag.corners[i].x,tag.corners[i].y]}));
}
export function estimateBoard(tags, markerMap) {
  const groups=tags.filter(t=>markerMap.has(t.id)).map(t=>tagPairs(t,markerMap.get(t.id)));
  if(!groups.length) return null;
  let best=[], bestError=Infinity;
  // Each complete marker supplies a non-degenerate hypothesis. Reject bad IDs/corners.
  for(const group of groups) {
    const h=fitHomography(group);if(!h)continue;
    let error=0;const inliers=[];
    for(const candidate of groups) {
      const e=candidate.reduce((sum,p)=>{
        const q=project(h,...p.world);return sum+Math.hypot(q[0]-p.image[0],q[1]-p.image[1]);
      },0)/4;
      if(e<5) {inliers.push(...candidate);error+=e;}
    }
    if(inliers.length>best.length || (inliers.length===best.length && error<bestError)) {best=inliers;bestError=error;}
  }
  const h=fitHomography(best);if(!h)return null;
  return {h,count:best.length/4};
}
export function planePose(h,width,height,fov=60) {
  const f=Math.max(width,height)/(2*Math.tan(fov*Math.PI/360)),cx=width/2,cy=height/2;
  const a=[(h[0]-cx*h[6])/f,(h[3]-cy*h[6])/f,h[6]];
  const b=[(h[1]-cx*h[7])/f,(h[4]-cy*h[7])/f,h[7]];
  const scale=2/(Math.hypot(...a)+Math.hypot(...b));
  const r1=a.map(v=>v*scale),r3=b.map(v=>v*scale);
  // z cross x points above the paper, toward the observing camera.
  let up=[r3[1]*r1[2]-r3[2]*r1[1],r3[2]*r1[0]-r3[0]*r1[2],r3[0]*r1[1]-r3[1]*r1[0]];
  const length=Math.hypot(...up);up=up.map(v=>v/length);
  const t=[(h[2]-cx)/f*scale,(h[5]-cy)/f*scale,scale];
  // Camera-space OpenCV (+y down,+z forward) to WebGL (+y up,-z forward).
  return {f, matrix:[r1[0],up[0],r3[0],t[0],-r1[1],-up[1],-r3[1],-t[1],-r1[2],-up[2],-r3[2],-t[2],0,0,0,1]};
}
