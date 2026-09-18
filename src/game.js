export const TOWER_RANGE=80;
export const CASTLE_MAX_HP=1000;
export class SiegeGame {
  constructor(random=Math.random) {this.random=random;this.reset();}
  reset() {
    this.hp=CASTLE_MAX_HP;this.wave=0;this.kills=0;this.time=0;this.enemies=[];this.towers=new Map();this.projectiles=[];
    this.state='ready';this.spawnLeft=0;this.spawnTimer=0;this.breakTimer=0;this.nextId=1;this.events=[];
  }
  start() {if(this.state==='ready'){this.state='playing';this.nextWave();}}
  nextWave() {this.wave++;this.spawnLeft=8+this.wave*4;this.spawnTimer=1;this.events.push({type:'wave',wave:this.wave});}
  setTower(id,x,z,active=true) {
    const tower=this.towers.get(id) || {id,x,z,cooldown:.15,angle:0,active:true};
    tower.x=x;tower.z=z;tower.active=active;this.towers.set(id,tower);return tower;
  }
  spawn() {
    const side=(this.nextId-1)%4,offset=(this.random()-.5)*1.6;
    const positions=[[offset*100,-185],[140,offset*140],[offset*100,185],[-140,offset*140]];
    const [x,z]=positions[side],type=this.nextId%3===0?'archer':'soldier';
    const maxHp=(type==='archer'?44:65)+this.wave*7;
    this.enemies.push({id:this.nextId++,x,z,type,hp:maxHp,maxHp,speed:type==='archer'?10:13+this.wave*.5,cooldown:1,phase:this.random()*6.28});
  }
  step(dt) {
    if(this.state!=='playing')return;
    dt=Math.min(dt,.05);this.time+=dt;
    if(this.spawnLeft>0){this.spawnTimer-=dt;if(this.spawnTimer<=0){this.spawn();this.spawnLeft--;this.spawnTimer=Math.max(.48,1.4-this.wave*.1);}}
    for(const enemy of this.enemies){
      const distance=Math.hypot(enemy.x,enemy.z),stop=enemy.type==='archer'?66:27;
      enemy.moving=distance>stop;
      if(enemy.moving){enemy.x-=enemy.x/distance*enemy.speed*dt;enemy.z-=enemy.z/distance*enemy.speed*dt;}
      else {enemy.cooldown-=dt;if(enemy.cooldown<=0){enemy.cooldown=enemy.type==='archer'?1.8:1.1;
        if(enemy.type==='archer')this.projectiles.push({from:[enemy.x,12,enemy.z],to:[0,18,0],age:0,duration:.65,hostile:true,damage:9});
        else {this.hp=Math.max(0,this.hp-7);this.events.push({type:'hit'});}
      }}
    }
    for(const tower of this.towers.values()){
      if(!tower.active)continue;tower.cooldown-=dt;
      const target=this.enemies.filter(e=>e.hp>0&&Math.hypot(e.x-tower.x,e.z-tower.z)<=TOWER_RANGE).sort((a,b)=>Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z))[0];
      if(target){tower.angle=Math.atan2(target.x-tower.x,target.z-tower.z);if(tower.cooldown<=0){tower.cooldown=.7;
        this.projectiles.push({from:[tower.x,27,tower.z],to:[target.x,9,target.z],age:0,duration:.25+Math.hypot(target.x-tower.x,target.z-tower.z)/200,targetId:target.id,damage:29});
        this.events.push({type:'shot',id:tower.id});
      }}
    }
    for(const arrow of this.projectiles){arrow.age+=dt;if(arrow.age>=arrow.duration&&!arrow.done){arrow.done=true;
      if(arrow.hostile)this.hp=Math.max(0,this.hp-arrow.damage);
      else {const enemy=this.enemies.find(e=>e.id===arrow.targetId);if(enemy)enemy.hp-=arrow.damage;}
    }}
    this.projectiles=this.projectiles.filter(p=>!p.done);
    this.enemies=this.enemies.filter(enemy=>{if(enemy.hp<=0){this.kills++;this.events.push({type:'kill',x:enemy.x,z:enemy.z});return false;}return true;});
    if(this.hp<=0){this.state='defeat';this.events.push({type:'defeat'});return;}
    if(!this.spawnLeft&&!this.enemies.length){this.breakTimer+=dt;if(this.breakTimer>5){this.breakTimer=0;if(this.wave>=6){this.state='victory';this.events.push({type:'victory'});}else this.nextWave();}}
  }
}
