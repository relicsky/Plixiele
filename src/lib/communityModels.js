const V = `varying vec2 vUv;varying vec3 vNormal;varying vec3 vPosition;varying vec3 vWorldPosition;
void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);vPosition=position;vWorldPosition=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`

const NOISE = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.;a*=0.5;}return v;}`

export const COMMUNITY_MODELS = [
  {
    id: 'crystal',
    title: 'Rainbow Crystal',
    tags: ['crystal', 'rainbow', 'fresnel'],
    thumb: ['#1a0a4a', '#00e5ff'],
    modelData: {
      description: 'Rainbow crystal sphere with prismatic dispersion',
      geometry: { type: 'SphereGeometry', params: [1, 64, 64] },
      vertexShader: V,
      fragmentShader: `uniform float uTime;uniform vec3 uColor1;uniform vec3 uColor2;
${NOISE}
varying vec3 vNormal;varying vec3 vWorldPosition;
void main(){
  vec3 vd=normalize(cameraPosition-vWorldPosition);
  float fr=pow(1.-max(dot(vNormal,vd),0.),3.);
  float n=fbm(vWorldPosition.xy*4.+uTime*.2)*.5+fbm(vWorldPosition.yz*8.)*.25;
  float hue=n+uTime*.04;
  vec4 K=vec4(1.,2./3.,1./3.,3.);
  vec3 p=abs(fract(vec3(hue)+K.xyz)*6.-K.www);
  vec3 rainbow=mix(K.xxx,clamp(p-K.xxx,0.,1.),.9);
  vec3 deep=mix(uColor1,uColor2,n);
  vec3 col=mix(deep,rainbow,fr*.85);
  col+=vec3(1.)*fr*.4;
  gl_FragColor=vec4(col,.9+fr*.1);
}`,
      uniforms: { uColor1: { value: [0.05, 0.02, 0.35] }, uColor2: { value: [0.0, 0.1, 0.7] } },
      animation: { rotationX: 0.05, rotationY: 0.45, rotationZ: 0.02 },
    },
  },
  {
    id: 'lava',
    title: 'Lava World',
    tags: ['lava', 'planet', 'procedural'],
    thumb: ['#2a0400', '#ff4400'],
    modelData: {
      description: 'Volcanic lava planet with flowing molten cracks',
      geometry: { type: 'SphereGeometry', params: [1, 64, 64] },
      vertexShader: V,
      fragmentShader: `uniform float uTime;uniform vec3 uColor1;uniform vec3 uColor2;uniform vec3 uColor3;
${NOISE}
varying vec3 vNormal;varying vec3 vWorldPosition;
void main(){
  vec2 uv=vec2(atan(vWorldPosition.x,vWorldPosition.z),vWorldPosition.y)*.5+.5;
  float lava=fbm(uv*3.+vec2(uTime*.08,uTime*.06));
  float cracks=smoothstep(.38,.55,lava);
  float glow=smoothstep(.48,.65,lava);
  vec3 col=mix(uColor3,mix(uColor2,uColor1,glow),cracks);
  vec3 vd=normalize(cameraPosition-vWorldPosition);
  float rim=pow(1.-max(dot(vNormal,vd),0.),2.5);
  col+=uColor1*rim*.6;
  float pulse=sin(uTime*.7)*.04+.96;
  gl_FragColor=vec4(col*pulse,1.);
}`,
      uniforms: {
        uColor1: { value: [1.0, 0.32, 0.0] },
        uColor2: { value: [0.9, 0.06, 0.0] },
        uColor3: { value: [0.06, 0.02, 0.01] },
      },
      animation: { rotationX: 0.02, rotationY: 0.3, rotationZ: 0.01 },
    },
  },
  {
    id: 'hologram',
    title: 'Hologram Knot',
    tags: ['hologram', 'sci-fi', 'torus'],
    thumb: ['#001a22', '#00e5ff'],
    modelData: {
      description: 'Holographic torus knot with scanlines and glitch',
      geometry: { type: 'TorusKnotGeometry', params: [0.9, 0.28, 120, 16, 2, 3] },
      vertexShader: V,
      fragmentShader: `uniform float uTime;uniform vec3 uColor1;
varying vec3 vNormal;varying vec3 vWorldPosition;
void main(){
  vec3 vd=normalize(cameraPosition-vWorldPosition);
  float fr=pow(1.-abs(dot(vNormal,vd)),2.);
  float scan=pow(sin(vWorldPosition.y*28.-uTime*6.)*.5+.5,3.);
  float glitch=step(.97,sin(vWorldPosition.y*10.+floor(uTime*8.)*.7+uTime*2.));
  float flicker=sin(uTime*25.)*.04+.96;
  vec3 col=uColor1*(0.35+fr*.65+scan*.3)+uColor1*glitch*.6;
  float alpha=(0.25+fr*.7+scan*.2)*flicker;
  gl_FragColor=vec4(col,clamp(alpha,0.,0.95));
}`,
      uniforms: { uColor1: { value: [0.0, 0.88, 1.0] } },
      animation: { rotationX: 0.1, rotationY: 0.5, rotationZ: 0.15 },
    },
  },
  {
    id: 'metal',
    title: 'Brushed Steel',
    tags: ['metal', 'steel', 'reflective'],
    thumb: ['#1a2030', '#7090b0'],
    modelData: {
      description: 'Polished brushed steel sphere with anisotropic highlights',
      geometry: { type: 'SphereGeometry', params: [1, 64, 64] },
      vertexShader: V,
      fragmentShader: `uniform float uTime;uniform vec3 uColor1;uniform vec3 uColor2;
${NOISE}
varying vec3 vNormal;varying vec3 vPosition;varying vec3 vWorldPosition;
void main(){
  vec3 vd=normalize(cameraPosition-vWorldPosition);
  vec3 L1=normalize(vec3(2.,3.,2.));
  vec3 L2=normalize(vec3(-2.,-1.,-2.));
  vec3 T=normalize(cross(vNormal,vec3(0.,1.,0.)));
  float a1=pow(max(dot(reflect(-L1,vNormal),vd),0.),80.);
  float a2=pow(max(dot(reflect(-L2,vNormal),vd),0.),40.);
  float brush=noise(vec2(dot(vPosition,T)*10.,vPosition.y*2.))*.12+.88;
  float diff=max(dot(vNormal,L1)*.65+dot(vNormal,L2)*.25+.1,0.);
  float env=pow(1.-max(dot(vNormal,vd),0.),1.5)*.25;
  vec3 col=uColor1*brush*diff;
  col+=uColor2*(a1*.9+a2*.4+env);
  gl_FragColor=vec4(col,1.);
}`,
      uniforms: {
        uColor1: { value: [0.55, 0.6, 0.65] },
        uColor2: { value: [0.88, 0.92, 0.96] },
      },
      animation: { rotationX: 0.04, rotationY: 0.35, rotationZ: 0.0 },
    },
  },
  {
    id: 'nebula',
    title: 'Deep Space Nebula',
    tags: ['space', 'nebula', 'cosmic'],
    thumb: ['#0a0020', '#8020e0'],
    modelData: {
      description: 'Cosmic nebula with swirling gas clouds and star sparks',
      geometry: { type: 'SphereGeometry', params: [1, 64, 64] },
      vertexShader: V,
      fragmentShader: `uniform float uTime;uniform vec3 uColor1;uniform vec3 uColor2;uniform vec3 uColor3;
${NOISE}
varying vec3 vNormal;varying vec3 vWorldPosition;
void main(){
  vec3 vd=normalize(cameraPosition-vWorldPosition);
  float fr=pow(1.-max(dot(vNormal,vd),0.),1.5);
  vec2 uv=vec2(atan(vWorldPosition.x,vWorldPosition.z)/6.28318,vWorldPosition.y*.5+.5);
  float n1=fbm(uv*2.5+vec2(uTime*.03,uTime*.02));
  float n2=fbm(uv*5.-vec2(uTime*.04,0.)+n1*.5);
  float n3=fbm(uv*1.5+vec2(0.,uTime*.01));
  vec3 col=mix(uColor1,uColor2,n1);
  col=mix(col,uColor3,n2*.65);
  col+=uColor3*n3*.3;
  col*=1.+fr*2.2;
  float star=step(.997,hash(floor(vWorldPosition.xy*120.+floor(uTime*.3))));
  col+=vec3(1.)*star*3.;
  gl_FragColor=vec4(col,.65+fr*.35);
}`,
      uniforms: {
        uColor1: { value: [0.45, 0.08, 0.75] },
        uColor2: { value: [0.08, 0.25, 0.85] },
        uColor3: { value: [0.9, 0.2, 0.65] },
      },
      animation: { rotationX: 0.03, rotationY: 0.25, rotationZ: 0.04 },
    },
  },
  {
    id: 'solar',
    title: 'Solar System',
    tags: ['multi-part', 'space', 'planets'],
    thumb: ['#020205', '#ffaa00'],
    modelData: {
      description: 'Mini solar system with sun, earth, and mars',
      parts: [
        {
          name: 'sun',
          geometry: { type: 'SphereGeometry', params: [0.45, 48, 48] },
          position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
          vertexShader: V,
          fragmentShader: `uniform float uTime;varying vec3 vNormal;varying vec3 vWorldPosition;
${NOISE}
void main(){
  vec2 uv=vec2(atan(vWorldPosition.x,vWorldPosition.z)/6.28318,vWorldPosition.y*.5+.5);
  float n=fbm(uv*4.+vec2(uTime*.15,uTime*.12));
  vec3 col=mix(vec3(1.,.9,.0),vec3(1.,.35,.0),n);
  col+=vec3(1.,.7,.0)*pow(max(n-.4,0.),2.)*3.;
  float fr=pow(1.-abs(dot(vNormal,normalize(cameraPosition-vWorldPosition))),2.);
  col+=vec3(1.,.6,.0)*fr*.8;
  gl_FragColor=vec4(col,1.);
}`,
          uniforms: {},
        },
        {
          name: 'earth',
          geometry: { type: 'SphereGeometry', params: [0.2, 32, 32] },
          position: [1.5, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
          vertexShader: V,
          fragmentShader: `uniform float uTime;varying vec3 vNormal;varying vec3 vWorldPosition;
${NOISE}
void main(){
  vec2 uv=vec2(atan(vWorldPosition.x-1.5,vWorldPosition.z)/6.28318,vWorldPosition.y*.5+.5);
  float land=step(.52,fbm(uv*6.+uTime*.02));
  vec3 ocean=vec3(.04,.2,.8);
  vec3 grass=vec3(.1,.55,.15);
  vec3 col=mix(ocean,grass,land);
  vec3 vd=normalize(cameraPosition-vWorldPosition);
  float diff=max(dot(vNormal,normalize(vec3(-1.5,0,0)-vWorldPosition))*.7+.3,0.);
  col*=diff;
  float atmo=pow(1.-max(dot(vNormal,vd),0.),3.);
  col+=vec3(.3,.5,1.)*atmo*.5;
  gl_FragColor=vec4(col,1.);
}`,
          uniforms: {},
        },
        {
          name: 'mars',
          geometry: { type: 'SphereGeometry', params: [0.14, 32, 32] },
          position: [2.5, 0.1, 0.4], rotation: [0, 0, 0], scale: [1, 1, 1],
          vertexShader: V,
          fragmentShader: `uniform float uTime;varying vec3 vNormal;varying vec3 vWorldPosition;
${NOISE}
void main(){
  vec2 uv=vec2(atan(vWorldPosition.x-2.5,vWorldPosition.z-.4)/6.28318,vWorldPosition.y*.5+.5);
  float n=fbm(uv*8.+uTime*.015);
  vec3 col=mix(vec3(.65,.2,.1),vec3(.8,.35,.15),n);
  vec3 vd=normalize(cameraPosition-vWorldPosition);
  float diff=max(dot(vNormal,normalize(vec3(-2.5,0,-.4)-vWorldPosition))*.7+.3,0.);
  col*=diff;
  gl_FragColor=vec4(col,1.);
}`,
          uniforms: {},
        },
      ],
      animation: { rotationX: 0.02, rotationY: 0.25, rotationZ: 0.01 },
    },
  },
  {
    id: 'organic',
    title: 'Bioluminescent',
    tags: ['organic', 'glow', 'cell'],
    thumb: ['#001408', '#00ff88'],
    modelData: {
      description: 'Bioluminescent deep-sea creature with pulsing cell patterns',
      geometry: { type: 'IcosahedronGeometry', params: [1, 3] },
      vertexShader: V,
      fragmentShader: `uniform float uTime;uniform vec3 uColor1;uniform vec3 uColor2;
${NOISE}
varying vec3 vNormal;varying vec3 vWorldPosition;
void main(){
  vec3 vd=normalize(cameraPosition-vWorldPosition);
  float fr=pow(1.-max(dot(vNormal,vd),0.),2.5);
  // Cell noise approximation
  vec2 uv=vWorldPosition.xy*3.+vec2(uTime*.1,0.);
  float c1=noise(uv)*noise(uv*2.3+1.7)*noise(uv*.7+3.1);
  float glow=smoothstep(.1,.4,c1);
  float pulse=sin(uTime*2.+vWorldPosition.y*4.)*.25+.75;
  vec3 col=mix(vec3(.01,.06,.03),uColor1,glow*pulse);
  col+=uColor2*(fr*.7+glow*.3)*pulse;
  col+=uColor1*fr*.5;
  gl_FragColor=vec4(col,.85+fr*.15);
}`,
      uniforms: {
        uColor1: { value: [0.0, 0.9, 0.5] },
        uColor2: { value: [0.0, 0.5, 0.9] },
      },
      animation: { rotationX: 0.06, rotationY: 0.35, rotationZ: 0.08 },
    },
  },
  {
    id: 'table',
    title: 'Carved Table',
    tags: ['multi-part', 'furniture', 'wood'],
    thumb: ['#1a0e05', '#8b5c2a'],
    modelData: {
      description: 'Wooden dining table with four carved legs',
      parts: [
        {
          name: 'top',
          geometry: { type: 'BoxGeometry', params: [2.0, 0.09, 1.0, 4, 1, 4] },
          position: [0, 0.45, 0], rotation: [0, 0, 0], scale: [1, 1, 1],
          vertexShader: V,
          fragmentShader: `uniform float uTime;uniform vec3 uColor1;
${NOISE}
varying vec3 vNormal;varying vec3 vPosition;varying vec3 vWorldPosition;
void main(){
  float grain=fbm(vec2(vPosition.x*8.,vPosition.z*2.))*.3+fbm(vec2(vPosition.x*20.,vPosition.z*5.))*.15;
  vec3 col=mix(uColor1,uColor1*1.3,grain);
  vec3 L=normalize(vec3(2.,3.,1.));
  float diff=max(dot(vNormal,L)*.7+.3,0.);
  vec3 vd=normalize(cameraPosition-vWorldPosition);
  float spec=pow(max(dot(reflect(-L,vNormal),vd),0.),24.)*.3;
  gl_FragColor=vec4(col*diff+spec,1.);
}`,
          uniforms: { uColor1: { value: [0.48, 0.28, 0.1] } },
        },
        ...[-0.85, 0.85].flatMap(x => [-0.38, 0.38].map(z => ({
          name: `leg_${x > 0 ? 'r' : 'l'}${z > 0 ? 'f' : 'b'}`,
          geometry: { type: 'CylinderGeometry', params: [0.045, 0.055, 0.82, 10] },
          position: [x, 0.04, z], rotation: [0, 0, 0], scale: [1, 1, 1],
          vertexShader: V,
          fragmentShader: `uniform float uTime;uniform vec3 uColor1;
${NOISE}
varying vec3 vNormal;varying vec3 vPosition;varying vec3 vWorldPosition;
void main(){
  float grain=noise(vec2(vPosition.y*6.,vPosition.x*15.))*.2+.85;
  vec3 col=uColor1*grain;
  vec3 L=normalize(vec3(2.,3.,1.));
  float diff=max(dot(vNormal,L)*.7+.3,0.);
  gl_FragColor=vec4(col*diff,1.);
}`,
          uniforms: { uColor1: { value: [0.38, 0.2, 0.07] } },
        }))),
      ],
      animation: { rotationX: 0, rotationY: 0.3, rotationZ: 0 },
    },
  },
]
