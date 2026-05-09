const V = `varying vec2 vUv;varying vec3 vNormal;varying vec3 vPosition;varying vec3 vWorldPosition;
void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);vPosition=position;vWorldPosition=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`

const NOISE = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=0.5;for(int i=0;i<5;i++){v+=a*noise(p);p*=2.;a*=0.5;}return v;}`

// ── HLSL prelude shared by every preset's HLSL variant ──
const HLSL_HEAD = `// Plixie HLSL Shader
// Unity: wrap in ShaderLab pass with HLSLPROGRAM ... ENDHLSL.
// Unreal: paste body of PlixieFrag into a Custom node.

cbuffer PlixieGlobals : register(b0) { float _Time; float3 _CameraPos; };

struct appdata { float4 vertex:POSITION; float3 normal:NORMAL; float2 uv:TEXCOORD0; };
struct v2f { float4 pos:SV_POSITION; float3 nrm:NORMAL; float2 uv:TEXCOORD0; float3 wpos:TEXCOORD1; };

v2f PlixieVert(appdata v) {
    v2f o;
    // Replace with engine MVP: Unity uses UnityObjectToClipPos(v.vertex)
    o.pos  = mul(float4(v.vertex.xyz, 1.0), float4x4(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1));
    o.nrm  = v.normal;
    o.uv   = v.uv;
    o.wpos = v.vertex.xyz;
    return o;
}

float hash(float2 p) { return frac(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
float noise(float2 p) {
    float2 i = floor(p), f = frac(p);
    f = f * f * (3.0 - 2.0 * f);
    return lerp(lerp(hash(i), hash(i + float2(1,0)), f.x),
                lerp(hash(i + float2(0,1)), hash(i + float2(1,1)), f.x), f.y);
}
float fbm(float2 p) {
    float v = 0.0, a = 0.5;
    for (int k = 0; k < 5; k++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
}
`

function mkHlsl(name, params, frag) {
  const buf = params.length
    ? `\ncbuffer PlixieParams : register(b1)\n{\n${params.map(p => '    ' + p).join('\n')}\n};\n`
    : ''
  return `${HLSL_HEAD}${buf}
// === ${name} ===
float4 PlixieFrag(v2f i) : SV_Target
{
${frag}
}
`
}

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
    hlsl: mkHlsl('Rainbow Crystal',
      ['float3 _Color1;', 'float3 _Color2;'],
`    float3 vd = normalize(_CameraPos - i.wpos);
    float fr = pow(1.0 - max(dot(i.nrm, vd), 0.0), 3.0);
    float n  = fbm(i.wpos.xy * 4.0 + _Time * 0.2) * 0.5 + fbm(i.wpos.yz * 8.0) * 0.25;
    float hue = n + _Time * 0.04;
    float4 K = float4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    float3 p = abs(frac(float3(hue,hue,hue) + K.xyz) * 6.0 - K.www);
    float3 rainbow = lerp(K.xxx, saturate(p - K.xxx), 0.9);
    float3 deep    = lerp(_Color1, _Color2, n);
    float3 col     = lerp(deep, rainbow, fr * 0.85);
    col += float3(1.0, 1.0, 1.0) * fr * 0.4;
    return float4(col, 0.9 + fr * 0.1);`),
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
    hlsl: mkHlsl('Lava World',
      ['float3 _Color1;', 'float3 _Color2;', 'float3 _Color3;'],
`    float2 uv = float2(atan2(i.wpos.x, i.wpos.z), i.wpos.y) * 0.5 + 0.5;
    float lava   = fbm(uv * 3.0 + float2(_Time * 0.08, _Time * 0.06));
    float cracks = smoothstep(0.38, 0.55, lava);
    float glow   = smoothstep(0.48, 0.65, lava);
    float3 col   = lerp(_Color3, lerp(_Color2, _Color1, glow), cracks);
    float3 vd    = normalize(_CameraPos - i.wpos);
    float rim    = pow(1.0 - max(dot(i.nrm, vd), 0.0), 2.5);
    col += _Color1 * rim * 0.6;
    float pulse = sin(_Time * 0.7) * 0.04 + 0.96;
    return float4(col * pulse, 1.0);`),
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
    hlsl: mkHlsl('Hologram Knot',
      ['float3 _Color1;'],
`    float3 vd = normalize(_CameraPos - i.wpos);
    float fr  = pow(1.0 - abs(dot(i.nrm, vd)), 2.0);
    float scan = pow(sin(i.wpos.y * 28.0 - _Time * 6.0) * 0.5 + 0.5, 3.0);
    float glitch = step(0.97, sin(i.wpos.y * 10.0 + floor(_Time * 8.0) * 0.7 + _Time * 2.0));
    float flicker = sin(_Time * 25.0) * 0.04 + 0.96;
    float3 col = _Color1 * (0.35 + fr * 0.65 + scan * 0.3) + _Color1 * glitch * 0.6;
    float a = (0.25 + fr * 0.7 + scan * 0.2) * flicker;
    return float4(col, clamp(a, 0.0, 0.95));`),
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
    hlsl: mkHlsl('Brushed Steel',
      ['float3 _Color1;', 'float3 _Color2;'],
`    float3 vd = normalize(_CameraPos - i.wpos);
    float3 L1 = normalize(float3( 2.0,  3.0,  2.0));
    float3 L2 = normalize(float3(-2.0, -1.0, -2.0));
    float3 T  = normalize(cross(i.nrm, float3(0.0, 1.0, 0.0)));
    float a1 = pow(max(dot(reflect(-L1, i.nrm), vd), 0.0), 80.0);
    float a2 = pow(max(dot(reflect(-L2, i.nrm), vd), 0.0), 40.0);
    float brush = noise(float2(dot(i.wpos, T) * 10.0, i.wpos.y * 2.0)) * 0.12 + 0.88;
    float diff  = max(dot(i.nrm, L1) * 0.65 + dot(i.nrm, L2) * 0.25 + 0.1, 0.0);
    float env   = pow(1.0 - max(dot(i.nrm, vd), 0.0), 1.5) * 0.25;
    float3 col  = _Color1 * brush * diff;
    col += _Color2 * (a1 * 0.9 + a2 * 0.4 + env);
    return float4(col, 1.0);`),
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
    hlsl: mkHlsl('Deep Space Nebula',
      ['float3 _Color1;', 'float3 _Color2;', 'float3 _Color3;'],
`    float3 vd = normalize(_CameraPos - i.wpos);
    float fr  = pow(1.0 - max(dot(i.nrm, vd), 0.0), 1.5);
    float2 uv = float2(atan2(i.wpos.x, i.wpos.z) / 6.28318, i.wpos.y * 0.5 + 0.5);
    float n1 = fbm(uv * 2.5 + float2(_Time * 0.03, _Time * 0.02));
    float n2 = fbm(uv * 5.0 - float2(_Time * 0.04, 0.0) + n1 * 0.5);
    float n3 = fbm(uv * 1.5 + float2(0.0, _Time * 0.01));
    float3 col = lerp(_Color1, _Color2, n1);
    col = lerp(col, _Color3, n2 * 0.65);
    col += _Color3 * n3 * 0.3;
    col *= 1.0 + fr * 2.2;
    float star = step(0.997, hash(floor(i.wpos.xy * 120.0 + floor(_Time * 0.3))));
    col += float3(1.0, 1.0, 1.0) * star * 3.0;
    return float4(col, 0.65 + fr * 0.35);`),
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
    hlsl: mkHlsl('Solar System (sun pass)',
      [],
`    // Multi-part solar system — this HLSL covers the SUN material.
    // For Earth and Mars, compose them as separate meshes with their own materials.
    float2 uv = float2(atan2(i.wpos.x, i.wpos.z) / 6.28318, i.wpos.y * 0.5 + 0.5);
    float n  = fbm(uv * 4.0 + float2(_Time * 0.15, _Time * 0.12));
    float3 col = lerp(float3(1.0, 0.9, 0.0), float3(1.0, 0.35, 0.0), n);
    col += float3(1.0, 0.7, 0.0) * pow(max(n - 0.4, 0.0), 2.0) * 3.0;
    float3 vd = normalize(_CameraPos - i.wpos);
    float fr  = pow(1.0 - abs(dot(i.nrm, vd)), 2.0);
    col += float3(1.0, 0.6, 0.0) * fr * 0.8;
    return float4(col, 1.0);`),
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
    hlsl: mkHlsl('Bioluminescent',
      ['float3 _Color1;', 'float3 _Color2;'],
`    float3 vd = normalize(_CameraPos - i.wpos);
    float fr  = pow(1.0 - max(dot(i.nrm, vd), 0.0), 2.5);
    float2 uv = i.wpos.xy * 3.0 + float2(_Time * 0.1, 0.0);
    float c1  = noise(uv) * noise(uv * 2.3 + 1.7) * noise(uv * 0.7 + 3.1);
    float glow  = smoothstep(0.1, 0.4, c1);
    float pulse = sin(_Time * 2.0 + i.wpos.y * 4.0) * 0.25 + 0.75;
    float3 col = lerp(float3(0.01, 0.06, 0.03), _Color1, glow * pulse);
    col += _Color2 * (fr * 0.7 + glow * 0.3) * pulse;
    col += _Color1 * fr * 0.5;
    return float4(col, 0.85 + fr * 0.15);`),
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
    hlsl: mkHlsl('Carved Table (wood material)',
      ['float3 _Color1;'],
`    // Multi-part table — apply this material to top + legs.
    float grain = fbm(float2(i.wpos.x * 8.0, i.wpos.z * 2.0)) * 0.3
                + fbm(float2(i.wpos.x * 20.0, i.wpos.z * 5.0)) * 0.15;
    float3 col = lerp(_Color1, _Color1 * 1.3, grain);
    float3 L = normalize(float3(2.0, 3.0, 1.0));
    float diff = max(dot(i.nrm, L) * 0.7 + 0.3, 0.0);
    float3 vd = normalize(_CameraPos - i.wpos);
    float spec = pow(max(dot(reflect(-L, i.nrm), vd), 0.0), 24.0) * 0.3;
    return float4(col * diff + spec, 1.0);`),
  },
  {
    id: 'plasma',
    title: 'Plasma Globe',
    tags: ['plasma', 'electric', 'energy'],
    thumb: ['#1a002a', '#ff00ff'],
    modelData: {
      description: 'Crackling plasma globe with electric arcs and inner core',
      geometry: { type: 'SphereGeometry', params: [1, 64, 64] },
      vertexShader: V,
      fragmentShader: `uniform float uTime;uniform vec3 uColor1;uniform vec3 uColor2;
${NOISE}
varying vec3 vNormal;varying vec3 vWorldPosition;
void main(){
  vec3 vd=normalize(cameraPosition-vWorldPosition);
  float fr=pow(1.-max(dot(vNormal,vd),0.),1.7);
  vec3 p=vWorldPosition;
  float arcs=0.;
  for(int k=0;k<5;k++){
    float t=uTime*.7+float(k)*1.3;
    vec3 dir=vec3(sin(t*1.3+float(k)),cos(t*1.7+float(k)*.7),sin(t*.9+float(k)*2.));
    float d=abs(dot(p,normalize(dir)));
    arcs+=pow(1.-clamp(d*1.4,0.,1.),18.);
  }
  float core=pow(1.-length(p),3.)*1.4;
  float n=fbm(p.xy*6.+uTime*.2);
  vec3 col=mix(uColor1,uColor2,n);
  col=mix(col,uColor2,arcs);
  col+=uColor1*core;
  col+=vec3(1.)*fr*.4;
  gl_FragColor=vec4(col,.55+fr*.45);
}`,
      uniforms: {
        uColor1: { value: [0.45, 0.05, 0.85] },
        uColor2: { value: [1.0, 0.3, 0.95] },
      },
      animation: { rotationX: 0.0, rotationY: 0.15, rotationZ: 0.0 },
    },
    hlsl: mkHlsl('Plasma Globe',
      ['float3 _Color1;', 'float3 _Color2;'],
`    float3 vd = normalize(_CameraPos - i.wpos);
    float fr  = pow(1.0 - max(dot(i.nrm, vd), 0.0), 1.7);
    float arcs = 0.0;
    [unroll] for (int k = 0; k < 5; k++) {
        float t = _Time * 0.7 + (float)k * 1.3;
        float3 dir = float3(sin(t * 1.3 + (float)k), cos(t * 1.7 + (float)k * 0.7), sin(t * 0.9 + (float)k * 2.0));
        float d = abs(dot(i.wpos, normalize(dir)));
        arcs += pow(1.0 - saturate(d * 1.4), 18.0);
    }
    float core = pow(1.0 - length(i.wpos), 3.0) * 1.4;
    float n = fbm(i.wpos.xy * 6.0 + _Time * 0.2);
    float3 col = lerp(_Color1, _Color2, n);
    col = lerp(col, _Color2, arcs);
    col += _Color1 * core;
    col += float3(1.0, 1.0, 1.0) * fr * 0.4;
    return float4(col, 0.55 + fr * 0.45);`),
  },
  {
    id: 'marble',
    title: 'Veined Marble',
    tags: ['marble', 'stone', 'classical'],
    thumb: ['#1a1a18', '#e8e0d4'],
    modelData: {
      description: 'Veined marble sphere with deep grey threads through cream stone',
      geometry: { type: 'SphereGeometry', params: [1, 64, 64] },
      vertexShader: V,
      fragmentShader: `uniform float uTime;uniform vec3 uColor1;uniform vec3 uColor2;
${NOISE}
varying vec3 vNormal;varying vec3 vWorldPosition;
void main(){
  float n=fbm(vWorldPosition.xy*1.4+fbm(vWorldPosition.yz*2.+uTime*.02)*1.2);
  float veins=smoothstep(.42,.48,abs(n-.5));
  vec3 col=mix(uColor1,uColor2,veins);
  vec3 L=normalize(vec3(2.,3.,1.));
  float diff=max(dot(vNormal,L)*.7+.3,0.);
  vec3 vd=normalize(cameraPosition-vWorldPosition);
  float spec=pow(max(dot(reflect(-L,vNormal),vd),0.),48.)*.4;
  float fr=pow(1.-max(dot(vNormal,vd),0.),3.)*.2;
  gl_FragColor=vec4(col*diff+spec+fr,1.);
}`,
      uniforms: {
        uColor1: { value: [0.92, 0.88, 0.82] },
        uColor2: { value: [0.18, 0.16, 0.15] },
      },
      animation: { rotationX: 0.02, rotationY: 0.18, rotationZ: 0.0 },
    },
    hlsl: mkHlsl('Veined Marble',
      ['float3 _Color1;', 'float3 _Color2;'],
`    float n = fbm(i.wpos.xy * 1.4 + fbm(i.wpos.yz * 2.0 + _Time * 0.02) * 1.2);
    float veins = smoothstep(0.42, 0.48, abs(n - 0.5));
    float3 col = lerp(_Color1, _Color2, veins);
    float3 L = normalize(float3(2.0, 3.0, 1.0));
    float diff = max(dot(i.nrm, L) * 0.7 + 0.3, 0.0);
    float3 vd = normalize(_CameraPos - i.wpos);
    float spec = pow(max(dot(reflect(-L, i.nrm), vd), 0.0), 48.0) * 0.4;
    float fr   = pow(1.0 - max(dot(i.nrm, vd), 0.0), 3.0) * 0.2;
    return float4(col * diff + spec + fr, 1.0);`),
  },
  {
    id: 'galaxy',
    title: 'Spiral Galaxy',
    tags: ['galaxy', 'space', 'spiral'],
    thumb: ['#02000a', '#88aaff'],
    modelData: {
      description: 'Spiral galaxy disc with arm bands and a glowing core',
      geometry: { type: 'TorusGeometry', params: [1.1, 0.45, 32, 96] },
      vertexShader: V,
      fragmentShader: `uniform float uTime;uniform vec3 uColor1;uniform vec3 uColor2;uniform vec3 uColor3;
${NOISE}
varying vec3 vNormal;varying vec3 vWorldPosition;
void main(){
  float a=atan(vWorldPosition.x,vWorldPosition.z);
  float r=length(vWorldPosition.xz);
  float spiral=sin(a*3.+r*4.-uTime*.4)*.5+.5;
  float arms=pow(spiral,2.5);
  float dust=fbm(vec2(a*4.+r*2.,uTime*.1));
  float core=smoothstep(1.4,.6,r);
  vec3 col=mix(uColor1,uColor2,arms);
  col=mix(col,uColor3,dust*.45);
  col+=uColor3*core*1.8;
  float star=step(.995,hash(floor(vWorldPosition.xz*60.)+floor(uTime*.5)));
  col+=vec3(1.)*star*2.5;
  vec3 vd=normalize(cameraPosition-vWorldPosition);
  float fr=pow(1.-abs(dot(vNormal,vd)),2.);
  gl_FragColor=vec4(col,.5+arms*.3+core*.5+fr*.2);
}`,
      uniforms: {
        uColor1: { value: [0.04, 0.05, 0.18] },
        uColor2: { value: [0.5, 0.65, 1.0] },
        uColor3: { value: [1.0, 0.85, 0.6] },
      },
      animation: { rotationX: 0.05, rotationY: 0.22, rotationZ: 0.0 },
    },
    hlsl: mkHlsl('Spiral Galaxy',
      ['float3 _Color1;', 'float3 _Color2;', 'float3 _Color3;'],
`    float a = atan2(i.wpos.x, i.wpos.z);
    float r = length(i.wpos.xz);
    float spiral = sin(a * 3.0 + r * 4.0 - _Time * 0.4) * 0.5 + 0.5;
    float arms = pow(spiral, 2.5);
    float dust = fbm(float2(a * 4.0 + r * 2.0, _Time * 0.1));
    float core = smoothstep(1.4, 0.6, r);
    float3 col = lerp(_Color1, _Color2, arms);
    col = lerp(col, _Color3, dust * 0.45);
    col += _Color3 * core * 1.8;
    float star = step(0.995, hash(floor(i.wpos.xz * 60.0) + floor(_Time * 0.5)));
    col += float3(1.0, 1.0, 1.0) * star * 2.5;
    float3 vd = normalize(_CameraPos - i.wpos);
    float fr = pow(1.0 - abs(dot(i.nrm, vd)), 2.0);
    return float4(col, 0.5 + arms * 0.3 + core * 0.5 + fr * 0.2);`),
  },
  {
    id: 'ice',
    title: 'Frozen Crystal',
    tags: ['ice', 'crystal', 'frost'],
    thumb: ['#0a1828', '#9be0ff'],
    modelData: {
      description: 'Frozen crystal shard with internal frost veins and cold glow',
      geometry: { type: 'OctahedronGeometry', params: [1, 1] },
      vertexShader: V,
      fragmentShader: `uniform float uTime;uniform vec3 uColor1;uniform vec3 uColor2;
${NOISE}
varying vec3 vNormal;varying vec3 vWorldPosition;
void main(){
  vec3 vd=normalize(cameraPosition-vWorldPosition);
  float fr=pow(1.-max(dot(vNormal,vd),0.),2.);
  float frost=fbm(vWorldPosition.xy*8.+fbm(vWorldPosition.yz*4.+uTime*.05)*2.);
  float crack=smoothstep(.55,.62,frost);
  vec3 deep=mix(uColor1,uColor2,frost*.7);
  vec3 col=mix(deep,vec3(1.),crack*.55);
  col+=uColor2*fr*1.2;
  col+=vec3(.7,.85,1.)*pow(fr,5.)*1.5;
  float chill=smoothstep(.0,1.,fr)*.3;
  col+=chill;
  gl_FragColor=vec4(col,.7+fr*.3);
}`,
      uniforms: {
        uColor1: { value: [0.06, 0.18, 0.32] },
        uColor2: { value: [0.55, 0.82, 1.0] },
      },
      animation: { rotationX: 0.03, rotationY: 0.22, rotationZ: 0.05 },
    },
    hlsl: mkHlsl('Frozen Crystal',
      ['float3 _Color1;', 'float3 _Color2;'],
`    float3 vd = normalize(_CameraPos - i.wpos);
    float fr  = pow(1.0 - max(dot(i.nrm, vd), 0.0), 2.0);
    float frost = fbm(i.wpos.xy * 8.0 + fbm(i.wpos.yz * 4.0 + _Time * 0.05) * 2.0);
    float crack = smoothstep(0.55, 0.62, frost);
    float3 deep = lerp(_Color1, _Color2, frost * 0.7);
    float3 col  = lerp(deep, float3(1.0, 1.0, 1.0), crack * 0.55);
    col += _Color2 * fr * 1.2;
    col += float3(0.7, 0.85, 1.0) * pow(fr, 5.0) * 1.5;
    col += smoothstep(0.0, 1.0, fr) * 0.3;
    return float4(col, 0.7 + fr * 0.3);`),
  },
]
