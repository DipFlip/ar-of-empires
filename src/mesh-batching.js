import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// All procedural opaque parts use the same surface properties. Bake their
// colours and local transforms into a shared draw call; leave animated parts out.
export const staticMaterial=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,flatShading:true});
export function batchStaticMeshes(parent,{exclude=[],sharedGeometries=[]}={}){
 const buckets=new Map(),removedGeometries=new Set();
 for(const mesh of [...parent.children]){
  if(!mesh.isMesh||exclude.includes(mesh)||!mesh.material.isMeshStandardMaterial||mesh.material.transparent)continue;
  const key=`${mesh.castShadow}/${mesh.receiveShadow}`;
  if(!buckets.has(key))buckets.set(key,[]);
  buckets.get(key).push(mesh);
 }
 for(const meshes of buckets.values()){
  if(meshes.length<2)continue;
  const parts=meshes.map(mesh=>{
   mesh.updateMatrix();const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrix);
   const count=geometry.getAttribute('position').count,colors=new Float32Array(count*3),color=mesh.material.color;
   for(let i=0;i<count;i++)color.toArray(colors,i*3);
   geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));return geometry;
  });
  const geometry=mergeGeometries(parts);parts.forEach(part=>part.dispose());
  if(!geometry)throw new Error('Static model parts have incompatible geometry.');
  const combined=new THREE.Mesh(geometry,staticMaterial);
  combined.castShadow=meshes[0].castShadow;combined.receiveShadow=meshes[0].receiveShadow;
  parent.add(combined);
  for(const mesh of meshes){parent.remove(mesh);if(!sharedGeometries.includes(mesh.geometry))removedGeometries.add(mesh.geometry);}
 }
 for(const geometry of removedGeometries)geometry.dispose();
}
