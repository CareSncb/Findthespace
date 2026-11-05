// =====================================================================
//  Shaders GLSL — planètes procédurales, atmosphères, soleil, ciel…
//  Tout est calculé dans l'espace objet (sphère unité) : le JS fournit
//  la position caméra (uCamPos) et la direction du soleil (uSunDir).
// =====================================================================

export const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){float f=0.0,a=0.5;for(int i=0;i<6;i++){f+=a*snoise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=0.5;}return f;}
float fbm4(vec3 p){float f=0.0,a=0.5;for(int i=0;i<4;i++){f+=a*snoise(p);p=p*2.07+vec3(5.3,1.1,7.7);a*=0.5;}return f;}
float ridge(vec3 p){float f=0.0,a=0.5;for(int i=0;i<5;i++){float n=1.0-abs(snoise(p));f+=a*n*n;p*=2.1;a*=0.5;}return f;}
vec3 hash3(vec3 p){
  p=vec3(dot(p,vec3(127.1,311.7,74.7)),dot(p,vec3(269.5,183.3,246.1)),dot(p,vec3(113.5,271.9,124.6)));
  return fract(sin(p)*43758.5453123);
}
float cells(vec3 p){
  vec3 i=floor(p), f=fract(p); float d=1.0;
  for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){
    vec3 g=vec3(float(x),float(y),float(z));
    vec3 r=g+hash3(i+g)-f; d=min(d,dot(r,r));
  }
  return sqrt(d);
}
`;

// Vertex shader générique : passe la position objet
export const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vP;
void main(){
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  #include <logdepthbuf_vertex>
}
`;

const HEAD = /* glsl */ `
#include <logdepthbuf_pars_fragment>
varying vec3 vP;
uniform vec3 uSunDir;
uniform vec3 uCamPos;
uniform float uTime;
`;

// ---------------------------------------------------------------------
//  Surface planétaire (0 = tellurique, 1 = lave, 2 = géante gazeuse,
//  3 = glace, 4 = lune cratérisée)
// ---------------------------------------------------------------------
export const PLANET_FRAG = HEAD + NOISE + /* glsl */ `
uniform int uType;
uniform float uSeed;
uniform vec3 uAtmo;
uniform float uAtmoI;
uniform float uBump;
uniform float uSunI;

float crater(vec3 p){
  float c = cells(p);
  return -(1.0-smoothstep(0.0,0.32,c))*0.5 + exp(-pow((c-0.34)*11.0,2.0))*0.18;
}

float height(vec3 n){
  vec3 p = n + uSeed;
  if(uType==0){ return fbm(p*1.5) + 0.25*ridge(p*3.0)*smoothstep(0.0,0.3,fbm4(p*1.2)) - 0.08; }
  if(uType==1){ return fbm(p*2.2) + 0.3*ridge(p*4.0); }
  if(uType==3){ return fbm(p*2.0)*0.6 + 0.3*ridge(p*5.0); }
  if(uType==4){ return fbm4(p*3.0)*0.35 + crater(p*4.0) + crater(p*9.0)*0.4 + crater(p*19.0)*0.15; }
  return 0.0;
}
float surf(float h){ return uType==0 ? max(h,0.0) : h; }

void main(){
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vP);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(uCamPos - vP);
  vec3 T = normalize(cross(abs(N.y)>0.99 ? vec3(1.0,0.0,0.0) : vec3(0.0,1.0,0.0), N));
  vec3 B = cross(N,T);

  float h0 = height(N);
  vec3 Nb = N;
  if(uType!=2){
    float e = 0.0025;
    float s0 = surf(h0);
    float sT = surf(height(normalize(N+T*e)));
    float sB = surf(height(normalize(N+B*e)));
    Nb = normalize(N - uBump*((sT-s0)/e*T + (sB-s0)/e*B));
  }

  float NdL = dot(N,L);
  float term = smoothstep(-0.06,0.14,NdL);
  float diff = max(dot(Nb,L),0.0)*term;
  float lat = abs(N.y);

  vec3 albedo = vec3(0.5);
  vec3 emissive = vec3(0.0);
  float ocean = 0.0;
  float specAmt = 0.03, specPow = 16.0;

  if(uType==0){
    float m = snoise(N*2.3+uSeed+17.0)*0.5+0.5;
    if(h0<0.0){
      float d = clamp(-h0*3.5,0.0,1.0);
      albedo = mix(vec3(0.02,0.16,0.24), vec3(0.004,0.025,0.075), d);
      ocean = 1.0;
    } else {
      vec3 sand=vec3(0.52,0.45,0.31), grass=vec3(0.07,0.16,0.04), forest=vec3(0.025,0.075,0.025);
      vec3 desert=vec3(0.52,0.36,0.2), rock=vec3(0.26,0.23,0.2), snow=vec3(0.92);
      float wet = smoothstep(0.35,0.6, m + (0.45-lat)*0.35);
      vec3 low = mix(desert, mix(grass,forest,smoothstep(0.5,0.8,m)), wet);
      albedo = mix(sand, low, smoothstep(0.0,0.025,h0));
      albedo = mix(albedo, rock, smoothstep(0.22,0.38,h0));
      albedo = mix(albedo, snow, smoothstep(0.44,0.52,h0+lat*0.25));
      // Lumières des villes côté nuit
      float urban = smoothstep(0.55,0.75, snoise(N*5.0+uSeed)*0.5+0.5) * smoothstep(0.02,0.06,h0) * (1.0-smoothstep(0.2,0.3,h0));
      float spots = pow(max(snoise(N*70.0),0.0),2.0) + pow(max(snoise(N*180.0),0.0),3.0);
      emissive += vec3(1.0,0.62,0.28) * urban * spots * 2.2 * (1.0-smoothstep(-0.2,0.05,NdL)) * (1.0-smoothstep(0.7,0.8,lat));
    }
    float ice = smoothstep(0.80,0.86, lat + snoise(N*6.0)*0.05);
    albedo = mix(albedo, vec3(0.9,0.94,1.0), ice);
    ocean *= 1.0-ice;
  }
  else if(uType==1){
    albedo = mix(vec3(0.05,0.04,0.035), vec3(0.13,0.07,0.045), smoothstep(-0.2,0.5,h0));
    float crack = pow(1.0-abs(snoise(N*5.0+uSeed)),45.0) + 0.5*pow(1.0-abs(snoise(N*13.0+uSeed)),60.0);
    float lake = smoothstep(-0.25,-0.4,h0);
    float flick = 0.85+0.15*sin(uTime*1.7+snoise(N*3.0)*6.0);
    emissive = vec3(1.0,0.28,0.04)*(crack*3.0 + lake*2.5)*flick*(0.35+0.65*(1.0-term));
    emissive += vec3(1.0,0.55,0.15)*lake*smoothstep(0.3,0.8,snoise(N*25.0+uTime*0.05))*3.0;
    specAmt = 0.08; specPow = 30.0;
  }
  else if(uType==2){
    float t = uTime*0.006;
    vec3 q = N + 0.08*vec3(fbm4(N*4.0+t), fbm4(N*4.0+3.1-t), fbm4(N*4.0+7.4+t));
    float band = q.y*9.0 + fbm(vec3(q.x*2.0,q.y*16.0,q.z*2.0)+uSeed)*0.9;
    vec3 c1=vec3(0.78,0.64,0.46), c2=vec3(0.55,0.37,0.24), c3=vec3(0.9,0.84,0.72), c4=vec3(0.38,0.27,0.2);
    float s1 = sin(band*3.1)*0.5+0.5, s2 = sin(band*7.3+1.0)*0.5+0.5;
    albedo = mix(mix(c1,c2,s1), mix(c3,c4,s2), smoothstep(0.25,0.75, snoise(vec3(0.0,q.y*5.0,0.0)+uSeed)*0.5+0.5));
    // Grande tempête
    vec3 sp = normalize(vec3(0.75,-0.32,0.55));
    float dd = distance(N,sp);
    float ang = atan(dot(N-sp,B), dot(N-sp,T));
    float swirl = sin(ang*3.0 + dd*60.0 - uTime*0.3)*0.5+0.5;
    albedo = mix(albedo, mix(vec3(0.72,0.32,0.16), vec3(0.85,0.55,0.35), swirl), smoothstep(0.17,0.09,dd+snoise(N*18.0)*0.02));
    albedo *= (0.9 + 0.2*fbm4(N*30.0+t*4.0))*0.55;
    specAmt = 0.0;
  }
  else if(uType==3){
    albedo = mix(vec3(0.62,0.74,0.86), vec3(0.95,0.97,1.0), smoothstep(-0.3,0.4,h0));
    float crev = pow(1.0-abs(snoise(N*8.0+uSeed)),26.0) + 0.5*pow(1.0-abs(snoise(N*21.0)),30.0);
    albedo = mix(albedo, vec3(0.08,0.25,0.45), clamp(crev,0.0,1.0)*0.8);
    specAmt = 0.35; specPow = 60.0;
  }
  else {
    albedo = vec3(0.32,0.3,0.28) * (0.75 + 0.5*(fbm4(N*6.0+uSeed)*0.5+0.5));
    albedo = mix(albedo, vec3(0.16,0.15,0.15), smoothstep(0.2,0.6, snoise(N*1.5+uSeed)));
  }

  vec3 sunCol = vec3(1.0,0.96,0.9)*uSunI;
  vec3 col = albedo*sunCol*diff + albedo*0.006;

  // Spéculaire (océans : reflet du soleil + Fresnel)
  vec3 H = normalize(L+V);
  float fres = 0.02 + 0.98*pow(1.0-max(dot(N,V),0.0),5.0);
  if(ocean>0.5){
    vec3 Nw = normalize(N + 0.04*vec3(snoise(N*120.0+uTime*0.2), snoise(N*120.0+11.0), snoise(N*120.0+uTime*0.2+4.0)));
    col += sunCol*pow(max(dot(Nw,H),0.0),180.0)*2.5*term;
    col += sunCol*pow(max(dot(Nw,H),0.0),24.0)*0.12*term;
    col += uAtmo*fres*0.25*term;
  } else {
    col += sunCol*pow(max(dot(Nb,H),0.0),specPow)*specAmt*term;
  }
  col += emissive;

  // Diffusion atmosphérique sur le limbe
  float rim = pow(1.0-max(dot(N,V),0.0), 2.5);
  col = mix(col, uAtmo*uSunI*0.5*smoothstep(-0.25,0.5,NdL), clamp(rim*uAtmoI,0.0,1.0)*smoothstep(-0.3,0.3,NdL));
  col += uAtmo * 0.15 * uAtmoI * smoothstep(-0.2,0.6,NdL);

  gl_FragColor = vec4(col,1.0);
}
`;

// ---------------------------------------------------------------------
//  Couche nuageuse animée
// ---------------------------------------------------------------------
export const CLOUD_FRAG = HEAD + NOISE + /* glsl */ `
uniform float uSunI;
uniform float uSeed;
void main(){
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vP);
  vec3 L = normalize(uSunDir);
  float a = uTime*0.004;
  vec3 q = vec3(cos(a)*N.x - sin(a)*N.z, N.y, sin(a)*N.x + cos(a)*N.z) + uSeed;
  vec3 w = q*2.0 + vec3(fbm4(q*3.0), fbm4(q*3.0+7.7), fbm4(q*3.0+3.3))*0.7;
  float c = fbm(w*1.6);
  float cov = smoothstep(0.02,0.42, c + 0.1*sin(N.y*9.0));
  cov *= 0.55 + 0.45*smoothstep(-0.2,0.4,fbm4(q*1.2));
  float NdL = dot(N,L);
  float lit = smoothstep(-0.15,0.35,NdL);
  vec3 tint = mix(vec3(1.0,0.55,0.35), vec3(1.0), smoothstep(0.0,0.35,NdL));
  vec3 col = tint*uSunI*lit*0.85 + 0.004;
  gl_FragColor = vec4(col, cov*0.95);
}
`;

// ---------------------------------------------------------------------
//  Atmosphère (coque BackSide, additive) : Rayleigh + diffusion avant
// ---------------------------------------------------------------------
export const ATMO_FRAG = HEAD + /* glsl */ `
uniform vec3 uAtmo;
uniform float uInner;   // rayon planète / rayon coque
uniform float uStrength;
void main(){
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vP);
  vec3 V = normalize(uCamPos - vP);
  vec3 L = normalize(uSunDir);
  float edge = sqrt(1.0 - uInner*uInner);
  float i = smoothstep(0.0, edge, -dot(N,V));
  i = pow(i, 1.8);
  float NdL = dot(N,L);
  float day = smoothstep(-0.35,0.5,NdL);
  float fwd = pow(max(dot(-V,L),0.0), 8.0);
  vec3 sunset = vec3(1.0,0.42,0.18);
  vec3 col = uAtmo*i*day*1.6;
  col += mix(sunset, uAtmo, day)*i*fwd*3.0*smoothstep(-0.6,0.15,NdL);
  gl_FragColor = vec4(col*uStrength, 1.0);
}
`;

// ---------------------------------------------------------------------
//  Soleil : granulation animée + assombrissement centre-bord
// ---------------------------------------------------------------------
export const SUN_FRAG = HEAD + NOISE + /* glsl */ `
void main(){
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vP);
  vec3 V = normalize(uCamPos - vP);
  float mu = max(dot(N,V),0.0);
  float g = fbm(N*7.0 + vec3(uTime*0.03));
  float g2 = cells(N*40.0 + uTime*0.05);
  float spots = smoothstep(0.55,0.7, snoise(N*2.5 + uTime*0.01));
  vec3 col = mix(vec3(1.0,0.38,0.06), vec3(1.0,0.86,0.6), clamp(g*0.6+0.55 + g2*0.25,0.0,1.0));
  col *= 1.0 - spots*0.6;
  col *= (0.35 + 0.65*pow(mu,0.45));
  gl_FragColor = vec4(col*9.0, 1.0);
}
`;

// ---------------------------------------------------------------------
//  Anneaux avec ombre portée de la planète
// ---------------------------------------------------------------------
export const RING_FRAG = HEAD + NOISE + /* glsl */ `
uniform float uSunI;
uniform float uIn;
uniform float uOut;
void main(){
  #include <logdepthbuf_fragment>
  float r = length(vP.xy);
  float t = (r-uIn)/(uOut-uIn);
  float b = snoise(vec3(r*38.0,0.0,0.0))*0.5+0.5;
  float f = snoise(vec3(r*170.0,3.0,0.0))*0.5+0.5;
  float a = smoothstep(0.0,0.04,t)*smoothstep(1.0,0.93,t)*(0.25+0.6*b+0.25*f);
  a *= smoothstep(0.015,0.045,abs(t-0.6));
  a *= mix(0.4,1.0,smoothstep(0.0,0.25,t));
  vec3 col = mix(vec3(0.78,0.68,0.54), vec3(0.45,0.38,0.31), b*0.7+f*0.3);
  vec3 L = normalize(uSunDir);
  vec3 P = vP;
  float pl = dot(P,L);
  float perp = length(P - pl*L);
  float shadow = pl<0.0 ? mix(0.04,1.0,smoothstep(0.97,1.03,perp)) : 1.0;
  vec3 V = normalize(uCamPos - vP);
  float fwd = pow(max(dot(-V,L),0.0),6.0);
  col *= 0.55*uSunI*(0.45 + 0.4*abs(L.z) + fwd*1.5)*shadow;
  gl_FragColor = vec4(col, clamp(a,0.0,1.0));
}
`;

// ---------------------------------------------------------------------
//  Ciel : Voie lactée procédurale, poussières, nébuleuses
// ---------------------------------------------------------------------
export const SKY_FRAG = HEAD + NOISE + /* glsl */ `
void main(){
  #include <logdepthbuf_fragment>
  vec3 d = normalize(vP);
  vec3 G = normalize(vec3(0.25,1.0,0.35));
  vec3 C = normalize(vec3(0.8,-0.3,-0.5)); C = normalize(C - dot(C,G)*G);
  float gd = dot(d,G);
  float core = pow(max(dot(d,C),0.0),5.0);
  float n  = fbm4(d*3.0)*0.5+0.5;
  float n2 = fbm4(d*8.0+5.0)*0.5+0.5;
  float n3 = fbm4(d*22.0+2.0)*0.5+0.5;
  float band = exp(-gd*gd*(16.0 - core*10.0));
  float dust = smoothstep(0.42,0.72,n2)*exp(-gd*gd*70.0);
  vec3 mw = mix(vec3(0.32,0.38,0.55), vec3(1.0,0.72,0.48), core);
  mw *= band*(0.3+0.9*n)*(0.5+0.6*n3)*(0.6+2.2*core);
  mw *= 1.0 - dust*0.9;
  float neb = pow(max(fbm4(d*1.4+vec3(3.0,1.0,7.0)),0.0),1.6);
  vec3 nebC = mix(vec3(0.55,0.08,0.35), vec3(0.04,0.28,0.45), fbm4(d*2.3)*0.5+0.5)*neb;
  vec3 col = mw*0.05 + nebC*0.035 + vec3(0.0004,0.0005,0.0009);
  gl_FragColor = vec4(col,1.0);
}
`;

// ---------------------------------------------------------------------
//  Étoiles (points HDR)
// ---------------------------------------------------------------------
export const STAR_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aColor;
attribute float aSize;
uniform float uPR;
uniform float uTime;
varying vec3 vC;
void main(){
  vec4 mv = modelViewMatrix*vec4(position,1.0);
  gl_Position = projectionMatrix*mv;
  float tw = 0.85 + 0.15*sin(uTime*3.0 + position.x*0.01 + position.y*0.013);
  vC = aColor*tw;
  gl_PointSize = aSize*uPR;
  #include <logdepthbuf_vertex>
}
`;
export const STAR_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
varying vec3 vC;
void main(){
  #include <logdepthbuf_fragment>
  float d = length(gl_PointCoord-0.5);
  float a = exp(-d*d*22.0);
  gl_FragColor = vec4(vC*a,1.0);
}
`;

// ---------------------------------------------------------------------
//  Poussière spatiale (traînées de vitesse)
// ---------------------------------------------------------------------
export const DUST_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aEnd;
uniform vec3 uCam;
uniform vec3 uVel;
varying float vA;
void main(){
  vec3 p = mod(position - uCam, 240.0) - 120.0 + uCam;
  vA = 1.0 - smoothstep(50.0,120.0,length(p-uCam));
  p -= uVel*0.035*aEnd;
  vA *= aEnd>0.5 ? 0.0 : 1.0;
  gl_Position = projectionMatrix*viewMatrix*vec4(p,1.0);
  #include <logdepthbuf_vertex>
}
`;
export const DUST_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform float uI;
varying float vA;
void main(){
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(vec3(0.6,0.75,1.0)*vA*uI,1.0);
}
`;

// ---------------------------------------------------------------------
//  Traînée de réacteur (particules)
// ---------------------------------------------------------------------
export const TRAIL_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float aAge;
uniform float uScale;
varying float vAge;
void main(){
  vAge = aAge;
  vec4 mv = modelViewMatrix*vec4(position,1.0);
  gl_Position = projectionMatrix*mv;
  gl_PointSize = (aAge<1.0 ? (1.0-aAge)*0.35+0.12 : 0.0) * uScale / -mv.z;
  #include <logdepthbuf_vertex>
}
`;
export const TRAIL_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
varying float vAge;
void main(){
  #include <logdepthbuf_fragment>
  float d = length(gl_PointCoord-0.5);
  float a = exp(-d*d*14.0)*(1.0-vAge);
  vec3 c = mix(vec3(0.8,0.95,1.0)*4.0, vec3(0.1,0.4,1.0), vAge);
  gl_FragColor = vec4(c*a*0.07,1.0);
}
`;

// ---------------------------------------------------------------------
//  Flamme de réacteur
// ---------------------------------------------------------------------
export const FLAME_VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying float vT;
varying vec3 vN;
varying vec3 vV;
void main(){
  vT = position.y / 3.0;
  vec4 mv = modelViewMatrix*vec4(position,1.0);
  vN = normalize(normalMatrix*normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix*mv;
  #include <logdepthbuf_vertex>
}
`;
export const FLAME_FRAG = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform float uPower;
uniform float uTime;
varying float vT;
varying vec3 vN;
varying vec3 vV;
void main(){
  #include <logdepthbuf_fragment>
  float core = pow(abs(dot(vN,vV)),1.5);
  float a = pow(1.0-clamp(vT,0.0,1.0),1.6)*core;
  a *= 0.85 + 0.15*sin(uTime*60.0 + vT*20.0);
  vec3 c = mix(vec3(0.9,0.95,1.0)*2.2, vec3(0.1,0.4,1.0)*1.2, clamp(vT*1.6,0.0,1.0));
  gl_FragColor = vec4(c*a*uPower,1.0);
}
`;

// ---------------------------------------------------------------------
//  Passe finale : aberration chromatique, vignettage, grain
// ---------------------------------------------------------------------
export const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberr: { value: 0.004 },
    uRes: { value: [1, 1] },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAberr;
    uniform vec2 uRes;
    varying vec2 vUv;
    void main(){
      vec2 c = vUv-0.5;
      float d = length(c);
      vec2 off = c*d*uAberr;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv+off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv-off).b;
      col *= mix(0.6,1.0,smoothstep(0.85,0.3,d));
      float n = fract(sin(dot(vUv*uRes + fract(uTime)*91.0, vec2(12.9898,78.233)))*43758.5453);
      col += (n-0.5)*0.028;
      gl_FragColor = vec4(col,1.0);
    }
  `,
};
