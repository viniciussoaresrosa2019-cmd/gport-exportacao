(() => {
  'use strict';
  const main=document.getElementById('gportLoginStage');
  const dialog=document.getElementById('loginDialog');
  const scene=document.querySelector('.scene');
  const ship=document.getElementById('ship');
  const cargo=document.getElementById('cargo');
  const cable=document.getElementById('cable');
  const traveller=document.getElementById('traveller');
  const route=document.getElementById('route');
  const button=document.getElementById('pause');
  const preference=matchMedia('(prefers-reduced-motion: reduce)');
  const params=new URLSearchParams(location.search);
  const requestedFrame=Number(params.get('frame'));
  const reviewTime=params.has('frame')&&Number.isFinite(requestedFrame)?Math.max(0,requestedFrame):null;
  const auditing=params.has('audit');
  let paused=preference.matches, elapsed=0, last=null, raf=null, ready=false;
  let source=null, length=0, pixelScale=1, dpr=1, originX=0, originY=0;
  let drawnWidth=386, drawnHeight=209;
  const canvas=document.createElement('canvas');
  canvas.className='ship-render';canvas.setAttribute('aria-hidden','true');main.append(canvas);
  const ctx=canvas.getContext('2d');
  function resize() {
    if(!source)return;
    const rect=main.getBoundingClientRect();
    dpr=window.devicePixelRatio||1;
    pixelScale=scene.getBoundingClientRect().width/1672*dpr;
    originX=rect.left*dpr;originY=rect.top*dpr;
    drawnWidth=386*pixelScale;drawnHeight=209*pixelScale;
    canvas.width=Math.ceil(drawnWidth)+2;canvas.height=Math.ceil(drawnHeight)+2;
    canvas.style.width=`${canvas.width/dpr}px`;canvas.style.height=`${canvas.height/dpr}px`;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    if(ready)render(reviewTime===null?elapsed:reviewTime);
  }
  function render(seconds) {
    const state=GportMotion.at(seconds);
    const x=(39+state.shipX)*pixelScale+originX;
    const y=(608+state.shipY)*pixelScale+originY;
    const left=Math.floor(x),top=Math.floor(y);
    canvas.style.left=`${(left-originX)/dpr}px`;canvas.style.top=`${(top-originY)/dpr}px`;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // Fractional motion is drawn in a single high-quality sampling pass from
    // the original PNG. No integer-only jumps and no repeated rescaling.
    ctx.drawImage(source,x-left,y-top,drawnWidth,drawnHeight);
    cargo.setAttribute('transform',`translate(${state.cargoX} ${state.cargoY}) rotate(${state.cargoAngle} 688.5 612)`);
    cable.setAttribute('d',`M687 562 L${687+state.cargoX} ${610+state.cargoY} M690 562 L${690+state.cargoX} ${610+state.cargoY}`);
    const p=route.getPointAtLength(state.routeProgress*length);
    traveller.setAttribute('transform',`translate(${p.x} ${p.y})`);
    traveller.setAttribute('opacity',state.routeOpacity);
    if(auditing){main.dataset.time=seconds.toFixed(4);main.dataset.loop=state.time.toFixed(4);}
  }
  function stop() { if(raf!==null)cancelAnimationFrame(raf);raf=null;last=null; }
  function start() { if(ready&&!paused&&!document.hidden&&dialog?.open&&reviewTime===null&&raf===null)raf=requestAnimationFrame(tick); }
  function tick(now) {
    raf=null;
    if(paused||document.hidden)return;
    if(last!==null)elapsed+=(now-last)/1000;
    last=now;
    const before=performance.now();render(elapsed);
    if(auditing) {
      main.dataset.frames=String(Number(main.dataset.frames||0)+1);
      main.dataset.maxRenderMs=Math.max(Number(main.dataset.maxRenderMs||0),performance.now()-before).toFixed(3);
    }
    raf=requestAnimationFrame(tick);
  }
  function update() {button.textContent=paused?'Reproduzir animação':'Pausar animação';button.setAttribute('aria-pressed',String(paused));}
  function setPaused(value) {paused=value;stop();update();start();}
  button.addEventListener('click',()=>setPaused(!paused));
  preference.addEventListener('change',e=>setPaused(e.matches));
  document.addEventListener('visibilitychange',()=>{stop();start();});
  window.addEventListener('pagehide',stop);
  window.addEventListener('pageshow',start);
  new MutationObserver(()=>{stop();start();}).observe(dialog,{attributes:true,attributeFilter:['open']});
  new ResizeObserver(resize).observe(main);
  window.addEventListener('resize',resize);
  const load=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;});
  update();
  Promise.all(['login-animation/background.png?v=20260911.1','login-animation/ship.png?v=20260911.1','login-animation/cargo.png?v=20260911.1'].map(load)).then(images=>{
    if(!window.GPORT_ROUTE||!window.GportMotion)throw new Error('Missing animation data');
    source=images[1];route.setAttribute('d',GPORT_ROUTE);length=route.getTotalLength();
    resize();render(reviewTime===null?0:reviewTime);
    ship.style.visibility='hidden';main.classList.add('ready');ready=true;start();
  }).catch(error=>{canvas.style.display='none';button.disabled=true;button.textContent='Animação indisponível';console.error(error);});
})();
