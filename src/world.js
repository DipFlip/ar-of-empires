import * as THREE from 'three';
import { batchStaticMeshes, staticMaterial } from './mesh-batching.js';
import { planePose } from './tracking-math.js';
import { TOWER_RANGE } from './game.js';
const materials=new Map();
function mat(color){if(!materials.has(color))materials.set(color,new THREE.MeshStandardMaterial({color,roughness:.9,flatShading:true}));return materials.get(color);}
const cube=new THREE.BoxGeometry(1,1,1);
function box(parent,x,y,z,w,h,d,color){const mesh=new THREE.Mesh(cube,mat(color));mesh.position.set(x,y,z);mesh.scale.set(w,h,d);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function cylinder(parent,x,y,z,r1,r2,h,color,segments=8){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r1,r2,h,segments),mat(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function flag(parent,x,y,z,color){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);cylinder(g,0,6,0,.35,.35,12,0xb8a47c,5);const mesh=box(g,3.6,10,0,7,4,.3,color);g.userData.flag=mesh;return g;}
function battlement(parent,x,y,z,w,d,color){box(parent,x,y,z,w,3,d,color);for(let i=-1;i<=1;i++){box(parent,x+i*w/3,y+2.6,z-d/2,w/5,3.3,2,color);box(parent,x+i*w/3,y+2.6,z+d/2,w/5,3.3,2,color);}box(parent,x-w/2,y+2.6,z,2,3.3,d/3,color);box(parent,x+w/2,y+2.6,z,2,3.3,d/3,color);}
function roof(parent,x,y,z,r,h,color){return cylinder(parent,x,y,z,0,r,h,color,4);}
function healthbar(width){const g=new THREE.Group();const bg=new THREE.Mesh(new THREE.PlaneGeometry(width+1.4,2.8),new THREE.MeshBasicMaterial({color:0x182120,depthTest:false,transparent:true,opacity:.95}));bg.renderOrder=9;g.add(bg);const fill=new THREE.Mesh(new THREE.PlaneGeometry(width,1.35),new THREE.MeshBasicMaterial({color:0x91c89e,depthTest:false,transparent:true}));fill.position.z=.02;fill.renderOrder=10;g.add(fill);g.userData.fill=fill;g.userData.width=width;return g;}
function setHealth(g,ratio){ratio=Math.max(0,ratio);g.userData.fill.scale.x=ratio;g.userData.fill.position.x=-(1-ratio)*g.userData.width/2;g.userData.fill.material.color.setHex(ratio>.4?0x8dc89c:0xe5785d);}
function castle(){
 const g=new THREE.Group(),stone=0xc5b998,dark=0x9b907b,blue=0x345766;
 box(g,0,1,0,56,2,54,0x7b8066);box(g,0,2.8,0,49,2.6,47,0xaca387);
 box(g,0,15,-5,23,26,24,stone);box(g,0,29,-5,25,3,26,dark);
 const mainRoof=roof(g,0,37,-5,21,17,blue);mainRoof.rotation.y=Math.PI/4;
 for(const x of [-21,21])for(const z of [-20,20]){
  box(g,x,15,z,11,26,11,stone);box(g,x,3,z,14,4,14,dark);battlement(g,x,29,z,13,13,stone);
  box(g,x,21,z+5.6,2.1,5,.25,0x344447);
 }
 box(g,-21,11,0,6,18,33,dark);box(g,21,11,0,6,18,33,dark);box(g,0,11,-20,34,18,6,dark);
 for(let x=-14;x<=14;x+=7)box(g,x,22,-20,4,4,6,stone);
 for(const x of [-21,21])for(let z=-12;z<=12;z+=8)box(g,x,22,z,6,4,4,stone);
 box(g,-12,10,20,13,16,6,stone);box(g,12,10,20,13,16,6,stone);box(g,0,20,20,14,6,6,stone);
 box(g,0,9,19.5,9,15,2,0x3c302a);for(let x=-3;x<=3;x+=1.5)box(g,x,9,21,0.45,14,.7,0x705b41);
 box(g,0,2,29,12,1,13,0x9e8c68);
 for(const x of [-7,7]){box(g,x,21,7.1,3,6,.3,0x303c40);box(g,x,13,7.1,3,5,.3,0x303c40);}
 flag(g,0,45,-5,0x68a4b2);flag(g,-21,34,20,0x68a4b2);flag(g,21,34,-20,0x68a4b2);
 const health=healthbar(35);health.position.set(0,61,0);g.add(health);g.userData.health=health;batchStaticMeshes(g,{sharedGeometries:[cube]});return g;
}
function person(type,friendly=false){
 const g=new THREE.Group(),body=new THREE.Group();g.add(body);
 const color=friendly?0x447786:type==='archer'?0xb77c48:0xad5145;
 const legs=[box(body,-1.3,2,0,1.6,4,1.8,0x493f36),box(body,1.3,2,0,1.6,4,1.8,0x493f36)];
 box(body,0,6,0,4.3,5,2.9,color);cylinder(body,0,9.9,0,1.65,1.6,2.6,0xd4b189,6);
 cylinder(body,0,11,0,1.8,2,1.3,friendly?0x718688:0x777d77,6);
 box(body,-2.8,6.2,.4,1.4,4,1.5,color);const arm=box(body,2.8,6.5,1,1.4,3.4,1.5,color);
 if(type==='soldier'){
  box(body,-3,5.8,1.8,3.5,4.8,.6,0x736f63);box(body,-3,5.8,2.2,.6,3.8,.3,0xc4b17a);
  box(body,3.3,9,1,0.55,7,.55,0xd0d3c6);box(body,3.3,6,1,2,.5,.5,0xb2a078);
 }else{
  const bow=new THREE.Mesh(new THREE.TorusGeometry(2.8,.28,4,12,Math.PI),mat(0x7f5834));bow.rotation.z=-Math.PI/2;bow.position.set(3.6,7,1.3);body.add(bow);
  box(body,3.6,7,1.3,.15,5.5,.15,0xd7c9a6);
 }
 batchStaticMeshes(body,{exclude:[...legs,arm],sharedGeometries:[cube]});
 g.userData={body,legs,arm};return g;
}
function tower(id){
 const g=new THREE.Group();box(g,0,1,0,24,2,24,0x7d8771);box(g,0,3,0,18,4,18,0xa49b81);
 box(g,0,13,0,13,20,13,0xc4b698);battlement(g,0,23,0,18,18,0xd2c4a4);
 for(const [x,z,rot] of [[0,6.6,0],[6.6,0,Math.PI/2],[0,-6.6,0],[-6.6,0,Math.PI/2]]){const slit=box(g,x,15,z,1.8,5,.25,0x334747);slit.rotation.y=rot;}
 const archer=person('archer',true);archer.scale.setScalar(.62);archer.position.y=25;g.add(archer);
 const ring=new THREE.Mesh(new THREE.RingGeometry(TOWER_RANGE-1,TOWER_RANGE,96),new THREE.MeshBasicMaterial({color:0xe0c987,side:THREE.DoubleSide,transparent:true,opacity:.44,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.6;g.add(ring);
 const disc=new THREE.Mesh(new THREE.CircleGeometry(TOWER_RANGE,64),new THREE.MeshBasicMaterial({color:0xc5b56e,transparent:true,opacity:.035,depthWrite:false,side:THREE.DoubleSide}));disc.rotation.x=-Math.PI/2;disc.position.y=.4;g.add(disc);
 const labelCanvas=document.createElement('canvas');labelCanvas.width=128;labelCanvas.height=128;const ctx=labelCanvas.getContext('2d');ctx.fillStyle='#182c2a';ctx.beginPath();ctx.arc(64,64,49,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d6bd80';ctx.lineWidth=5;ctx.stroke();ctx.fillStyle='#f9edcf';ctx.font='bold 65px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String.fromCharCode(65+id-10),64,68);
 const badge=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(labelCanvas),depthTest:false}));badge.scale.set(9,9,1);badge.position.set(0,39,0);g.add(badge);
 batchStaticMeshes(g,{sharedGeometries:[cube]});
 g.userData={archer,ring,disc,id,badge};return g;
}
export class World {
 constructor(container){
  this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.setClearColor(0x000000,0);this.renderer.info.autoReset=false;this.metrics={sceneMs:0,renderCpuMs:0};container.appendChild(this.renderer.domElement);
  this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(40,1,1,3000);this.root=new THREE.Group();this.scene.add(this.root);
  const ambient=new THREE.HemisphereLight(0xdceceb,0x655738,2.6);this.scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xffe1a6,3.1);sun.position.set(-130,330,180);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-250;sun.shadow.camera.right=250;sun.shadow.camera.top=250;sun.shadow.camera.bottom=-250;sun.shadow.camera.near=1;sun.shadow.camera.far=1000;sun.shadow.bias=-.001;sun.shadow.normalBias=.3;this.root.add(sun);this.root.add(sun.target);
  this.platform=box(this.root,0,-4,0,215,7,302,0x343f34);
  this.ground=box(this.root,0,-.6,0,210,1,297,0x75865b);
  box(this.root,0,.02,0,13,.2,295,0xaa9b73);box(this.root,0,.04,0,208,.2,11,0xa99b73);
  for(let x=-100;x<=100;x+=40)for(let z=-140;z<=140;z+=40){box(this.root,x,.15,z,1.3,.2,1.3,0xb2bc84);}
  this.edges=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(210,.3,297)),new THREE.LineBasicMaterial({color:0xc8c190,transparent:true,opacity:.6}));this.root.add(this.edges);
  for(let i=0;i<44;i++){
   const x=Math.sin(i*17.73)*98,z=Math.cos(i*31.7)*142;if(Math.abs(x)<33||Math.abs(z)<33)continue;
   if(i%3===0)cylinder(this.root,x,2,z,1,3,4,0x858c70,5);
   else {const tuft=box(this.root,x,1,z,.6,2,2,0x506747);tuft.rotation.z=.3;}
  }
  batchStaticMeshes(this.root,{exclude:[this.platform,this.ground],sharedGeometries:[cube]});
  this.castle=castle();this.root.add(this.castle);this.towers=new Map();this.enemies=new Map();this.arrowMeshes=[];this.healthbars=[this.castle.userData.health];this.ranges=true;
  this.flags=[];this.castle.traverse(o=>{if(o.userData.flag)this.flags.push(o);});
  this.arrowFrom=new THREE.Vector3();this.arrowTo=new THREE.Vector3();this.arrowUp=new THREE.Vector3(0,1,0);this.rootQ=new THREE.Quaternion();this.cameraQ=new THREE.Quaternion();
  this.arrowGeo=new THREE.ConeGeometry(.75,4,5);this.arrowMat=mat(0xe2c38a);this.mode='demo';this.setDemo();
 }
 setDemo(){this.mode='demo';this.root.matrixAutoUpdate=true;this.root.matrix.identity();this.root.position.set(0,0,0);this.root.rotation.set(0,0,0);this.root.scale.set(1,1,1);this.root.visible=true;this.platform.visible=true;this.ground.material.transparent=false;this.ground.material.opacity=1;this.camera.position.set(260,345,380);this.camera.lookAt(0,0,0);this.resize();}
 setAR(){this.mode='ar';this.root.matrixAutoUpdate=false;this.root.visible=false;this.platform.visible=false;this.camera.position.set(0,0,0);this.camera.quaternion.identity();this.camera.updateMatrixWorld();}
 resize(){const el=this.renderer.domElement.parentElement;const w=el.clientWidth,h=el.clientHeight;this.renderer.setSize(w,h);if(this.mode==='demo'){this.camera.aspect=w/h;this.camera.fov=w/h<.8?74:40;this.camera.updateProjectionMatrix();}}
 applyBoard(h,width,height){
  const {matrix,f}=planePose(h,width,height);this.root.matrix.set(...matrix);this.root.matrixWorldNeedsUpdate=true;this.root.visible=true;
  // Video and render canvas share the same contain-fit rectangle, with no crop.
  this.camera.projectionMatrix.makePerspective(-width/2/f,width/2/f,height/2/f,-height/2/f,1,4000);
  this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
 }
 toggleRanges(){this.ranges=!this.ranges;return this.ranges;}
 update(game,dt,time){
  const started=performance.now();
  setHealth(this.castle.userData.health,game.hp/1000);
  for(const o of this.flags)o.userData.flag.rotation.y=Math.sin(time*3+o.position.x)*.12;
  for(const [id,data] of game.towers){
   let mesh=this.towers.get(id);if(!mesh){mesh=tower(id);this.towers.set(id,mesh);this.root.add(mesh);}
   mesh.position.set(data.x,0,data.z);mesh.visible=data.active;mesh.userData.archer.rotation.y=data.angle;
   mesh.userData.ring.visible=this.ranges;mesh.userData.disc.visible=this.ranges;
  }
  for(const [id,mesh] of this.towers)if(!game.towers.has(id)){this.root.remove(mesh);this.disposeObject(mesh);this.towers.delete(id);}
  const ids=new Set(game.enemies.map(e=>e.id));
  for(const [id,mesh] of this.enemies)if(!ids.has(id)){this.root.remove(mesh);this.disposeObject(mesh);this.enemies.delete(id);}
  for(const enemy of game.enemies){
   let mesh=this.enemies.get(enemy.id);if(!mesh){mesh=person(enemy.type);const health=healthbar(9);health.position.y=15;mesh.add(health);mesh.userData.health=health;this.enemies.set(enemy.id,mesh);this.root.add(mesh);}
   mesh.position.set(enemy.x,0,enemy.z);mesh.userData.body.rotation.y=Math.atan2(-enemy.x,-enemy.z);
   const stride=enemy.moving?Math.sin(game.time*10+enemy.phase):0;mesh.userData.legs[0].rotation.x=stride*.5;mesh.userData.legs[1].rotation.x=-stride*.5;mesh.userData.body.position.y=Math.abs(stride)*.6;
   mesh.userData.arm.rotation.x=enemy.moving?.15:Math.sin(game.time*6)*.5;setHealth(mesh.userData.health,enemy.hp/enemy.maxHp);
  }
  while(this.arrowMeshes.length<game.projectiles.length){const mesh=new THREE.Mesh(this.arrowGeo,this.arrowMat);this.root.add(mesh);this.arrowMeshes.push(mesh);}
  this.arrowMeshes.forEach((mesh,i)=>{
   const p=game.projectiles[i];mesh.visible=!!p;if(!p)return;
   const t=Math.min(1,p.age/p.duration),a=this.arrowFrom.fromArray(p.from),b=this.arrowTo.fromArray(p.to);
   mesh.position.lerpVectors(a,b,t);mesh.position.y+=Math.sin(t*Math.PI)*12;
   const dir=b.sub(a);dir.y+=Math.cos(t*Math.PI)*Math.PI*12;mesh.quaternion.setFromUnitVectors(this.arrowUp,dir.normalize());
  });
  this.root.updateMatrixWorld(true);
  const rootQ=this.root.getWorldQuaternion(this.rootQ).invert(),cameraQ=this.camera.getWorldQuaternion(this.cameraQ);
  const q=rootQ.multiply(cameraQ);this.castle.userData.health.quaternion.copy(q);
  for(const mesh of this.enemies.values())mesh.userData.health.quaternion.copy(q);
  const renderStart=performance.now();this.metrics.sceneMs=renderStart-started;
  this.renderer.info.reset();this.monitor?.beginRender();
  this.renderer.render(this.scene,this.camera);
  this.metrics.renderCpuMs=performance.now()-renderStart;this.monitor?.endRender();
 }
 pickGround(event){
  const rect=this.renderer.domElement.getBoundingClientRect(),pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  const ray=new THREE.Raycaster();ray.setFromCamera(pointer,this.camera);const hit=new THREE.Vector3();return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),hit)?hit:null;
 }
 disposeObject(object){
  const cached=new Set([...materials.values(),staticMaterial]),geometries=new Set(),ownedMaterials=new Set();
  object.traverse(child=>{if(child.geometry&&child.geometry!==cube)geometries.add(child.geometry);if(child.material&&!cached.has(child.material))ownedMaterials.add(child.material);});
  for(const geometry of geometries)geometry.dispose();
  for(const material of ownedMaterials){material.map?.dispose();material.dispose();}
 }
}
