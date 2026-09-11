/* All motions share a 14-second cycle, with matching position and velocity
   at the seam. This pure function is also used by the regression checks. */
(function(root) {
  const DURATION=14;
  const smoothstep=x=>{const t=Math.max(0,Math.min(1,x));return t*t*(3-2*t);};
  function at(seconds) {
    const t=((seconds%DURATION)+DURATION)%DURATION;
    const phase=t*Math.PI*2/DURATION;
    const routeProgress=(t%7)/7;
    return {
      time:t,
      shipX:17*(1-Math.cos(phase)),
      shipY:-1.8*Math.sin(2*phase),
      cargoX:1.7*Math.sin(2*phase),
      cargoY:7*(1-Math.cos(phase)),
      cargoAngle:.55*Math.sin(2*phase),
      routeProgress,
      routeOpacity:smoothstep(routeProgress/.065)*smoothstep((1-routeProgress)/.065)
    };
  }
  root.GportMotion={duration:DURATION,at};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.GportMotion;
})(typeof window!=='undefined'?window:globalThis);
