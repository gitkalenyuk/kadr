/* Kadr site — hero aurora (WebGL1). Falls back to the CSS gradient behind it.
   Renders at reduced resolution, pauses off-screen / in background tabs and
   draws a single still frame when the user prefers reduced motion. */
(() => {
  const canvas = document.getElementById('hero-gl');
  if (!canvas) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let gl;
  try {
    gl = canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
  } catch (e) { gl = null; }
  if (!gl) return;

  const vs = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const fs = `precision mediump float;
uniform vec2 r;uniform float t;uniform vec2 m;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
 return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){
 vec2 uv=gl_FragCoord.xy/r;
 vec2 p=uv;p.x*=r.x/r.y;
 float tt=t*.035;
 p+=m*.06;
 vec2 q=vec2(fbm(p*1.25+vec2(tt,-tt*.6)),fbm(p*1.25+vec2(-tt*.8,tt)+3.1));
 float f=fbm(p*1.55+q*1.9+vec2(tt*1.6,-tt));
 float ribbon=smoothstep(.42,.86,f)*(.55+.45*sin(p.x*2.2+q.y*4.+t*.12));
 vec3 teal=vec3(.12,.82,.86),vio=vec3(.48,.38,1.),pink=vec3(1.,.24,.55);
 vec3 col=mix(teal,vio,smoothstep(.15,.75,uv.x+q.x*.7-.35));
 col=mix(col,pink,smoothstep(.62,1.05,uv.x+q.y*.55-.05));
 float top=smoothstep(.05,.85,uv.y);
 vec3 c=col*ribbon*top*.62;
 c+=col*pow(f,3.)*.10*top;
 float g=h(gl_FragCoord.xy+fract(t))*.025;
 c+=vec3(.027,.027,.04)+g;
 gl_FragColor=vec4(c,1.);
}`;
  function sh(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  } catch (e) { return; }
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uR = gl.getUniformLocation(prog, 'r');
  const uT = gl.getUniformLocation(prog, 't');
  const uM = gl.getUniformLocation(prog, 'm');

  const SCALE = 0.42; // render at a fraction of CSS pixels; the result is soft anyway
  let w = 0, h = 0;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const nw = Math.max(2, Math.round(rect.width * SCALE));
    const nh = Math.max(2, Math.round(rect.height * SCALE));
    if (nw !== w || nh !== h) {
      w = nw; h = nh;
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }
  let mx = 0, my = 0, tmx = 0, tmy = 0;
  addEventListener('pointermove', (e) => {
    tmx = e.clientX / innerWidth - 0.5;
    tmy = 0.5 - e.clientY / innerHeight;
  }, { passive: true });

  const t0 = performance.now() - 20000;
  let raf = 0, visible = true;
  function frame(now) {
    raf = 0;
    mx += (tmx - mx) * 0.03; my += (tmy - my) * 0.03;
    gl.uniform2f(uR, w, h);
    gl.uniform1f(uT, (now - t0) / 1000);
    gl.uniform2f(uM, mx, my);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reduce && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf) raf = requestAnimationFrame(frame); }

  resize();
  addEventListener('resize', () => { resize(); if (reduce) start(); }, { passive: true });
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) start(); }, { rootMargin: '100px' }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); canvas.classList.remove('ready'); });
  start();
  requestAnimationFrame(() => canvas.classList.add('ready'));
})();
