// <ca3-grainient> — full-bleed WebGL2 grainy gradient background (port of React Bits' Grainient, no deps).
// Attributes mirror the React props: color1 color2 color3 time-speed color-balance warp-strength warp-frequency
// warp-speed warp-amplitude blend-angle blend-softness rotation-amount noise-scale grain-amount grain-scale
// grain-animated contrast gamma saturation center-x center-y zoom light-mode.
class CA3Grainient extends HTMLElement {
  connectedCallback() {
    if (this._init) return; this._init = true;
    this.style.display = "block"; this.style.position = "absolute"; this.style.inset = "0"; this.style.overflow = "hidden";
    const c = document.createElement("canvas");
    c.style.cssText = "width:100%;height:100%;display:block";
    this.appendChild(c);
    const gl = c.getContext("webgl2", { antialias: false, alpha: true });
    if (!gl) { this.removeChild(c); return; } // CSS fallback gradient on .fbg stays visible
    const vs = `#version 300 es
in vec2 position;void main(){gl_Position=vec4(position,0.,1.);}`;
    const fs = `#version 300 es
precision highp float;
uniform vec2 iResolution;uniform float iTime;
uniform float uTimeSpeed,uColorBalance,uWarpStrength,uWarpFrequency,uWarpSpeed,uWarpAmplitude,uBlendAngle,uBlendSoftness,uRotationAmount,uNoiseScale,uGrainAmount,uGrainScale,uGrainAnimated,uContrast,uGamma,uSaturation,uZoom,uLightMode;
uniform vec2 uCenterOffset;uniform vec3 uColor1,uColor2,uColor3;
out vec4 fragColor;
#define S(a,b,t) smoothstep(a,b,t)
mat2 Rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
vec2 hash(vec2 p){p=vec2(dot(p,vec2(2127.1,81.17)),dot(p,vec2(1269.5,283.37)));return fract(sin(p)*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);float n=mix(mix(dot(-1.0+2.0*hash(i+vec2(0.0,0.0)),f-vec2(0.0,0.0)),dot(-1.0+2.0*hash(i+vec2(1.0,0.0)),f-vec2(1.0,0.0)),u.x),mix(dot(-1.0+2.0*hash(i+vec2(0.0,1.0)),f-vec2(0.0,1.0)),dot(-1.0+2.0*hash(i+vec2(1.0,1.0)),f-vec2(1.0,1.0)),u.x),u.y);return 0.5+0.5*n;}
void main(){
  float t=iTime*uTimeSpeed;
  vec2 uv=gl_FragCoord.xy/iResolution.xy;
  float ratio=iResolution.x/iResolution.y;
  vec2 tuv=uv-0.5+uCenterOffset;
  tuv/=max(uZoom,0.001);
  float degree=noise(vec2(t*0.1,tuv.x*tuv.y)*uNoiseScale);
  tuv.y*=1.0/ratio;
  tuv*=Rot(radians((degree-0.5)*uRotationAmount+180.0));
  tuv.y*=ratio;
  float frequency=uWarpFrequency;
  float ws=max(uWarpStrength,0.001);
  float amplitude=uWarpAmplitude/ws;
  float warpTime=t*uWarpSpeed;
  tuv.x+=sin(tuv.y*frequency+warpTime)/amplitude;
  tuv.y+=sin(tuv.x*(frequency*1.5)+warpTime)/(amplitude*0.5);
  vec3 colLav=uColor1,colOrg=uColor2,colDark=uColor3;
  float b=uColorBalance;
  float s=max(uBlendSoftness,0.0);
  mat2 blendRot=Rot(radians(uBlendAngle));
  float blendX=(tuv*blendRot).x;
  float edge0=-0.3-b-s,edge1=0.2-b+s,v0=0.5-b+s,v1=-0.3-b-s;
  vec3 layer1=mix(colDark,colOrg,S(edge0,edge1,blendX));
  vec3 layer2=mix(colOrg,colLav,S(edge0,edge1,blendX));
  vec3 col=mix(layer1,layer2,S(v0,v1,tuv.y));
  vec2 grainUv=uv*max(uGrainScale,0.001);
  if(uGrainAnimated>0.5){grainUv+=vec2(iTime*0.05);}
  float grain=fract(sin(dot(grainUv,vec2(12.9898,78.233)))*43758.5453);
  col+=(grain-0.5)*uGrainAmount;
  col=(col-0.5)*uContrast+0.5;
  float luma=dot(col,vec3(0.2126,0.7152,0.0722));
  col=mix(vec3(luma),col,uSaturation);
  col=pow(max(col,0.0),vec3(1.0/max(uGamma,0.001)));
  col=clamp(col,0.0,1.0);
  if(uLightMode>0.5){
    float energy=max(max(col.r,col.g),col.b);
    vec3 hue=col/max(energy,0.001);
    float chroma=length(col-vec3(dot(col,vec3(0.333333))));
    float coverage=clamp(0.12+chroma*1.15+energy*0.18,0.0,0.88);
    col=mix(vec3(1.0),clamp(hue*0.58+col*0.18,0.0,1.0),coverage);
  }
  fragColor=vec4(col,1.0);
}`;
    const sh = (ty, src) => { const s = gl.createShader(ty); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(pr); gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "position"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n) => gl.getUniformLocation(pr, n);
    const num = (a, d) => { const v = parseFloat(this.getAttribute(a)); return Number.isFinite(v) ? v : d; };
    const rgb = (a, d) => { const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(this.getAttribute(a) || d); return m ? [1, 2, 3].map((i) => parseInt(m[i], 16) / 255) : [1, 1, 1]; };
    const f1 = [
      ["uTimeSpeed", "time-speed", 0.25], ["uColorBalance", "color-balance", 0], ["uWarpStrength", "warp-strength", 1],
      ["uWarpFrequency", "warp-frequency", 5], ["uWarpSpeed", "warp-speed", 2], ["uWarpAmplitude", "warp-amplitude", 50],
      ["uBlendAngle", "blend-angle", 0], ["uBlendSoftness", "blend-softness", 0.05], ["uRotationAmount", "rotation-amount", 500],
      ["uNoiseScale", "noise-scale", 2], ["uGrainAmount", "grain-amount", 0.1], ["uGrainScale", "grain-scale", 2],
      ["uContrast", "contrast", 1.5], ["uGamma", "gamma", 1], ["uSaturation", "saturation", 1], ["uZoom", "zoom", 0.9],
    ];
    for (const [u, a, d] of f1) gl.uniform1f(U(u), num(a, d));
    gl.uniform1f(U("uGrainAnimated"), this.hasAttribute("grain-animated") ? 1 : 0);
    gl.uniform1f(U("uLightMode"), this.hasAttribute("light-mode") ? 1 : 0);
    gl.uniform2f(U("uCenterOffset"), num("center-x", 0), num("center-y", 0));
    gl.uniform3fv(U("uColor1"), rgb("color1", "#FF9FFC"));
    gl.uniform3fv(U("uColor2"), rgb("color2", "#5227FF"));
    gl.uniform3fv(U("uColor3"), rgb("color3", "#B497CF"));
    const uR = U("iResolution"), uT = U("iTime");
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = () => gl.drawArrays(gl.TRIANGLES, 0, 3);
    const size = () => {
      const d = Math.min(devicePixelRatio || 1, 2);
      c.width = Math.max(1, Math.round(c.clientWidth * d)); c.height = Math.max(1, Math.round(c.clientHeight * d));
      gl.viewport(0, 0, c.width, c.height); gl.uniform2f(uR, c.width, c.height); draw();
    };
    new ResizeObserver(size).observe(c); size();
    // Pause when scrolled offscreen or the tab is hidden.
    let raf = 0, vis = true, pageVis = !document.hidden;
    const t0 = performance.now();
    const frame = () => { gl.uniform1f(uT, (performance.now() - t0) / 1000); draw(); raf = requestAnimationFrame(frame); };
    const start = () => { if (!still && vis && pageVis && !raf) raf = requestAnimationFrame(frame); };
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
    new IntersectionObserver((e) => { vis = e[0].isIntersecting; vis ? start() : stop(); }).observe(this);
    document.addEventListener("visibilitychange", () => { pageVis = !document.hidden; pageVis ? start() : stop(); });
    start();
  }
}
customElements.define("ca3-grainient", CA3Grainient);
