// <ca3-prismatic> — full-bleed WebGL2 ray-marched light burst (React Bits "PrismaticBurst", ported to a plain custom element, no deps).
// Attributes: intensity, speed, animation-type (rotate | rotate3d | hover), colors (comma-separated hex; empty = spectral),
// distort, paused, offset-x, offset-y (px), hover-dampness (0-1), ray-count, mix-blend-mode (CSS value or none), light-mode.
class CA3Prismatic extends HTMLElement {
  connectedCallback() {
    if (this._init) return; this._init = true;
    const num = (n, d) => { const v = parseFloat(this.getAttribute(n)); return Number.isFinite(v) ? v : d; };
    this.style.display = "block"; this.style.position = "absolute"; this.style.inset = "0"; this.style.overflow = "hidden";
    const c = document.createElement("canvas");
    c.style.cssText = "width:100%;height:100%;display:block";
    const blend = this.getAttribute("mix-blend-mode") || "lighten";
    if (!this.hasAttribute("light-mode") && blend !== "none") c.style.mixBlendMode = blend;
    this.appendChild(c);
    const gl = c.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) { this.removeChild(c); this.style.background = "radial-gradient(120% 90% at 50% 40%,#101a34,#05070f)"; return; }
    const vs = `#version 300 es
in vec2 position;void main(){gl_Position=vec4(position,0.,1.);}`;
    const fs = `#version 300 es
precision highp float;precision highp int;
out vec4 fragColor;
uniform vec2 uResolution;uniform float uTime,uIntensity,uSpeed,uDistort,uNoiseAmount,uLightMode;
uniform int uAnimType,uColorCount,uRayCount;uniform vec2 uMouse,uOffset;uniform sampler2D uGradient;
float hash21(vec2 p){p=floor(p);float f=52.9829189*fract(dot(p,vec2(0.065,0.005)));return fract(f);}
mat2 rot30(){return mat2(0.8,-0.5,0.5,0.8);}
float layeredNoise(vec2 fragPx){vec2 p=mod(fragPx+vec2(uTime*30.0,-uTime*21.0),1024.0);vec2 q=rot30()*p;float n=0.0;
 n+=0.40*hash21(q);n+=0.25*hash21(q*2.0+17.0);n+=0.20*hash21(q*4.0+47.0);n+=0.10*hash21(q*8.0+113.0);n+=0.05*hash21(q*16.0+191.0);return n;}
vec3 rayDir(vec2 frag,vec2 res,vec2 offset,float dist){float focal=res.y*max(dist,1e-3);return normalize(vec3(2.0*(frag-offset)-res,focal));}
float edgeFade(vec2 frag,vec2 res,vec2 offset){vec2 toC=frag-0.5*res-offset;float r=length(toC)/(0.5*min(res.x,res.y));float x=clamp(r,0.0,1.0);
 float q=x*x*x*(x*(x*6.0-15.0)+10.0);float s=q*0.5;s=pow(s,1.5);float tail=1.0-pow(1.0-s,2.0);s=mix(s,tail,0.2);
 float dn=(layeredNoise(frag*0.15)-0.5)*0.0015*s;return clamp(s+dn,0.0,1.0);}
mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1.0,0.0,0.0,0.0,c,-s,0.0,s,c);}
mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.0,s,0.0,1.0,0.0,-s,0.0,c);}
mat3 rotZ(float a){float c=cos(a),s=sin(a);return mat3(c,-s,0.0,s,c,0.0,0.0,0.0,1.0);}
vec3 sampleGradient(float t){t=clamp(t,0.0,1.0);return texture(uGradient,vec2(t,0.5)).rgb;}
vec2 rot2(vec2 v,float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c)*v;}
float bendAngle(vec3 q,float t){return 0.8*sin(q.x*0.55+t*0.6)+0.7*sin(q.y*0.50-t*0.5)+0.6*sin(q.z*0.60+t*0.7);}
void main(){
 vec2 frag=gl_FragCoord.xy;float t=uTime*uSpeed;float jitterAmp=0.1*clamp(uNoiseAmount,0.0,1.0);
 vec3 dir=rayDir(frag,uResolution,uOffset,1.0);float marchT=0.0;vec3 col=vec3(0.0);float n=layeredNoise(frag);
 vec4 c=cos(t*0.2+vec4(0.0,33.0,11.0,0.0));mat2 M2=mat2(c.x,c.y,c.z,c.w);float amp=clamp(uDistort,0.0,50.0)*0.15;
 mat3 rot3dMat=mat3(1.0);if(uAnimType==1){vec3 ang=vec3(t*0.31,t*0.21,t*0.17);rot3dMat=rotZ(ang.z)*rotY(ang.y)*rotX(ang.x);}
 mat3 hoverMat=mat3(1.0);if(uAnimType==2){vec2 m=uMouse*2.0-1.0;vec3 ang=vec3(m.y*0.6,m.x*0.6,0.0);hoverMat=rotY(ang.y)*rotX(ang.x);}
 for(int i=0;i<44;++i){
  vec3 P=marchT*dir;P.z-=2.0;float rad=length(P);vec3 Pl=P*(10.0/max(rad,1e-6));
  if(uAnimType==0){Pl.xz*=M2;}else if(uAnimType==1){Pl=rot3dMat*Pl;}else{Pl=hoverMat*Pl;}
  float stepLen=min(rad-0.3,n*jitterAmp)+0.1;
  float grow=smoothstep(0.35,3.0,marchT);
  float a1=amp*grow*bendAngle(Pl*0.6,t);float a2=0.5*amp*grow*bendAngle(Pl.zyx*0.5+3.1,t*0.9);
  vec3 Pb=Pl;Pb.xz=rot2(Pb.xz,a1);Pb.xy=rot2(Pb.xy,a2);
  float rayPattern=smoothstep(0.5,0.7,sin(Pb.x+cos(Pb.y)*cos(Pb.z))*sin(Pb.z+sin(Pb.y)*cos(Pb.x+t)));
  if(uRayCount>0){float ang=atan(Pb.y,Pb.x);float comb=0.5+0.5*cos(float(uRayCount)*ang);comb=pow(comb,3.0);rayPattern*=smoothstep(0.15,0.95,comb);}
  vec3 spectralDefault=1.0+vec3(cos(marchT*3.0+0.0),cos(marchT*3.0+1.0),cos(marchT*3.0+2.0));
  float saw=fract(marchT*0.25);float tRay=saw*saw*(3.0-2.0*saw);vec3 userGradient=2.0*sampleGradient(tRay);
  vec3 spectral=(uColorCount>0)?userGradient:spectralDefault;
  vec3 base=(0.05/(0.4+stepLen))*smoothstep(5.0,0.0,rad)*spectral;
  col+=base*rayPattern;marchT+=stepLen;
 }
 col*=edgeFade(frag,uResolution,uOffset);col*=uIntensity;col=clamp(col,0.0,1.0);
 if(uLightMode>0.5){float energy=max(max(col.r,col.g),col.b);vec3 hue=col/max(energy,0.0001);float neutral=min(hue.r,min(hue.g,hue.b));
  hue=max(hue-vec3(neutral*0.68),vec3(0.0));hue/=max(max(hue.r,max(hue.g,hue.b)),0.0001);vec3 pigment=mix(hue,hue*hue,0.24)*0.64;
  float coverage=smoothstep(0.001,0.32,energy);coverage=pow(coverage,0.72)*0.92;col=mix(vec3(1.0),pigment,coverage);}
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
    // Gradient: 1×N RGBA texture sampled along x (white 1×1 when no colors given → spectral default).
    const hex = (s) => { let h = s.trim().replace(/^#/, ""); if (h.length === 3) h = h.replace(/./g, (ch) => ch + ch); const v = parseInt(h.slice(0, 6), 16); return Number.isNaN(v) || (h.length !== 6 && h.length !== 8) ? [255, 255, 255] : [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
    const colors = (this.getAttribute("colors") || "").split(/[,\s]+/).filter(Boolean).slice(0, 64);
    const count = colors.length;
    const px = new Uint8Array(Math.max(1, count) * 4).fill(255);
    colors.forEach((cl, i) => { const [r, g, b] = hex(cl); px.set([r, g, b, 255], i * 4); });
    const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, Math.max(1, count), 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(U("uGradient"), 0); gl.uniform1i(U("uColorCount"), count);
    const animType = { rotate: 0, rotate3d: 1, hover: 2 }[this.getAttribute("animation-type")] ?? 1;
    gl.uniform1i(U("uAnimType"), animType);
    gl.uniform1f(U("uIntensity"), num("intensity", 2));
    gl.uniform1f(U("uSpeed"), num("speed", 0.5));
    gl.uniform1f(U("uDistort"), num("distort", 0));
    gl.uniform1f(U("uNoiseAmount"), 0.8);
    gl.uniform1i(U("uRayCount"), Math.max(0, Math.floor(num("ray-count", 0))));
    gl.uniform1f(U("uLightMode"), this.hasAttribute("light-mode") ? 1 : 0);
    gl.uniform2f(U("uOffset"), num("offset-x", 0), num("offset-y", 0));
    const uR = U("uResolution"), uT = U("uTime"), uM = U("uMouse");
    const hoverDamp = Math.max(0, Math.min(1, num("hover-dampness", 0)));
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draw = () => gl.drawArrays(gl.TRIANGLES, 0, 3);
    const size = () => {
      const d = Math.min(devicePixelRatio || 1, 2);
      c.width = Math.max(1, Math.round(c.clientWidth * d)); c.height = Math.max(1, Math.round(c.clientHeight * d));
      gl.viewport(0, 0, c.width, c.height); gl.uniform2f(uR, c.width, c.height); draw();
    };
    new ResizeObserver(size).observe(c); size();
    // Pointer is tracked on the window because the hero's scrim/text sit above this element.
    const tgt = [0.5, 0.5], sm = [0.5, 0.5];
    if (animType === 2) addEventListener("pointermove", (e) => {
      const r = this.getBoundingClientRect();
      tgt[0] = Math.min(Math.max((e.clientX - r.left) / Math.max(r.width, 1), 0), 1);
      tgt[1] = Math.min(Math.max((e.clientY - r.top) / Math.max(r.height, 1), 0), 1);
    }, { passive: true });
    let vis = true;
    new IntersectionObserver((e) => { vis = e[0].isIntersecting; }, { threshold: 0.01 }).observe(this);
    let last = performance.now(), acc = 0;
    const frame = (now) => {
      const dt = Math.max(0, now - last) * 0.001; last = now;
      if (!this.hasAttribute("paused")) acc += dt;
      if (vis && !document.hidden) {
        const alpha = 1 - Math.exp(-dt / (0.02 + hoverDamp * 0.5));
        sm[0] += (tgt[0] - sm[0]) * alpha; sm[1] += (tgt[1] - sm[1]) * alpha;
        gl.uniform2f(uM, sm[0], sm[1]); gl.uniform1f(uT, acc); draw();
      }
      if (!still) requestAnimationFrame(frame);
    };
    frame(last);
  }
}
customElements.define("ca3-prismatic", CA3Prismatic);
