import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchStaticMeshes,staticMaterial } from '../src/mesh-batching.js';

test('batching preserves transformed bounds, per-part colours, animated meshes and shared geometry',()=>{
 const group=new THREE.Group(),shared=new THREE.BoxGeometry(1,1,1);
 const red=new THREE.MeshStandardMaterial({color:0xff0000}),blue=new THREE.MeshStandardMaterial({color:0x0000ff});
 const a=new THREE.Mesh(shared,red),b=new THREE.Mesh(shared,blue),arm=new THREE.Mesh(shared,red);
 a.position.set(4,2,1);a.rotation.z=.4;a.scale.set(2,3,4);b.position.set(-3,1,2);
 for(const mesh of [a,b,arm]){mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
 const before=new THREE.Box3().setFromObject(group);let disposed=false;shared.addEventListener('dispose',()=>disposed=true);
 batchStaticMeshes(group,{exclude:[arm],sharedGeometries:[shared]});
 assert.equal(group.children.length,2);assert.equal(arm.parent,group);assert.equal(disposed,false);
 const combined=group.children.find(x=>x!==arm),after=new THREE.Box3().setFromObject(group);
 assert.ok(before.min.distanceTo(after.min)<1e-6);assert.ok(before.max.distanceTo(after.max)<1e-6);
 assert.equal(combined.material,staticMaterial);assert.equal(combined.castShadow,true);assert.equal(combined.receiveShadow,true);
 const color=combined.geometry.getAttribute('color');assert.deepEqual(Array.from(color.array.slice(0,3)),[1,0,0]);assert.deepEqual(Array.from(color.array.slice(-3)),[0,0,1]);
 arm.rotation.x=.5;assert.equal(arm.rotation.x,.5);
 combined.geometry.dispose();shared.dispose();red.dispose();blue.dispose();
});

test('batching leaves transparent surfaces separate and preserves shadow participation',()=>{
 const group=new THREE.Group(),geometry=new THREE.BoxGeometry(1,1,1),opaque=new THREE.MeshStandardMaterial(),transparent=new THREE.MeshStandardMaterial({transparent:true});
 for(let i=0;i<4;i++){const mesh=new THREE.Mesh(geometry,opaque);mesh.castShadow=i<2;group.add(mesh);}
 const ring=new THREE.Mesh(geometry,transparent);group.add(ring);
 batchStaticMeshes(group,{sharedGeometries:[geometry]});
 assert.equal(group.children.length,3);assert.equal(ring.parent,group);
 assert.equal(group.children.filter(m=>m.castShadow).length,1);
 for(const mesh of group.children)if(mesh!==ring)mesh.geometry.dispose();geometry.dispose();opaque.dispose();transparent.dispose();
});
