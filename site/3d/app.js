(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const q = 1.602176634e-19;
  const hPlanck = 6.62607015e-34;
  const cLight = 299792458;
  const photopic = [0.00004,0.00012,0.000396,0.00121,0.004,0.0116,0.023,0.038,0.06,0.091,0.139,0.208,0.323,0.503,0.71,0.862,0.954,0.995,0.995,0.952,0.87,0.757,0.631,0.503,0.381,0.265,0.175,0.107,0.061,0.032,0.017,0.00821,0.0041,0.00209,0.00105,0.00052,0.000249,0.00012];
  const defaults = { width:20, depth:15, active:30, edgeLength:1.5, density:0, srv:2, abulk:6.69897, b:5, c:0.1, injection:95, lee:70, wavelength:450 };
  let state = null;
  let yaw = -0.65;
  let zoom = 1;
  let drag = null;
  let heatmapBounds = null;

  function read() {
    return { widthUm:+$('width').value, depthUm:+$('depth').value, activeNm:+$('active').value,
      currentDensity:10 ** (-1 + 4 * (+$('density').value / 100)), srv:10 ** (+$('srv').value),
      edgeLengthUm:+$('edge-length').value, aBulk:10 ** (+$('abulk').value), b:+$('b').value * 1e-11, auger:+$('c').value * 1e-30,
      injection:+$('injection').value / 100, lee:+$('lee').value / 100, wavelengthNm:+$('wavelength').value };
  }

  function carrierDensity(generation, a, b, auger) {
    const rate = (n) => a*n + b*n*n + auger*n*n*n;
    let low=0, high=Math.max(1,generation/Math.max(a,1));
    while (rate(high)<generation && high<1e22) high*=2;
    for(let i=0;i<90;i++){const mid=(low+high)/2;if(rate(mid)<generation)low=mid;else high=mid;}
    return (low+high)/2;
  }

  function calculate(p,j,columns=12) {
    const widthCm=p.widthUm*1e-4,depthCm=p.depthUm*1e-4,active=p.activeNm*1e-7;
    const perimeterArea=2*(1/widthCm+1/depthCm),sidewallA=p.srv*perimeterArea;
    const rows=Math.max(8,Math.min(56,Math.round(columns*p.depthUm/p.widthUm)));
    const rawWeights=[];
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
      const x=p.widthUm*(col+.5)/columns,y=p.depthUm*(row+.5)/rows,ell=p.edgeLengthUm;
      rawWeights.push(Math.exp(-x/ell)+Math.exp(-(p.widthUm-x)/ell)+Math.exp(-y/ell)+Math.exp(-(p.depthUm-y)/ell));
    }
    const meanWeight=rawWeights.reduce((sum,value)=>sum+value,0)/rawWeights.length;
    const generation=j*p.injection/(q*active);
    const cells=[];let iqeSum=0,eqeSum=0,nSum=0,surfaceShareSum=0,index=0;
    for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
      const localSurfaceA=sidewallA*rawWeights[index++]/meanWeight;
      const n=carrierDensity(generation,p.aBulk+localSurfaceA,p.b,p.auger);
      const rad=p.b*n*n,bulk=p.aBulk*n,surface=localSurfaceA*n,auger=p.auger*n*n*n,total=rad+bulk+surface+auger;
      const iqe=total?rad/total:0,eqe=p.injection*iqe*p.lee;
      iqeSum+=iqe;eqeSum+=eqe;nSum+=n;surfaceShareSum+=total?surface/total:0;
      cells.push({x:(col+.5)/columns,y:(row+.5)/rows,eqe});
    }
    return {n:nSum/cells.length,iqe:iqeSum/cells.length,eqe:eqeSum/cells.length,sidewallA,sidewallShare:surfaceShareSum/cells.length,perimeterArea,cells,columns,rows};
  }

  function colorForWave(nm) {
    let r=0,g=0,b=0;
    if(nm<440){r=nm<420?.3*(nm-380)/40:(440-nm)/60;b=1;}
    else if(nm<490){g=(nm-440)/50;b=1;}
    else if(nm<510){g=1;b=-(nm-510)/20;}
    else if(nm<580){r=(nm-510)/70;g=1;}
    else if(nm<645){r=1;g=-(nm-645)/65;}else r=1;
    const factor=nm<420?.3+.7*(nm-380)/40:nm>700?.3+.7*(750-nm)/50:1;
    const channel=(x)=>Math.round(255*Math.pow(Math.max(0,x*factor),.8)).toString(16).padStart(2,'0');
    const name=nm<450?'보라':nm<495?'청색':nm<520?'청록':nm<565?'녹색':nm<590?'황록':nm<625?'주황':'적색';
    return {hex:`#${channel(r)}${channel(g)}${channel(b)}`,name};
  }

  function updateInputs() {
    $('width-out').textContent=`${$('width').value} μm`;
    $('depth-out').textContent=`${$('depth').value} μm`;
    $('active-out').textContent=`${$('active').value} nm`;
    $('edge-length-out').textContent=`${$('edge-length').value} μm`;
    $('density-out').textContent=`${(10**(-1+4*(+$('density').value/100))).toPrecision(3)} A/cm²`;
    $('srv-out').textContent=`${(10**(+$('srv').value)).toPrecision(3)} cm/s`;
    $('abulk-out').textContent=`${(10**(+$('abulk').value)).toPrecision(3)} s⁻¹`;
    $('b-out').textContent=`${(+$('b').value).toFixed(1)} × 10⁻¹¹`;
    $('c-out').textContent=`${(+$('c').value).toFixed(1)} × 10⁻³⁰`;
    $('injection-out').textContent=`${$('injection').value}%`;
    $('lee-out').textContent=`${$('lee').value}%`;
    const wl=colorForWave(+$('wavelength').value);
    $('wavelength-out').textContent=`${$('wavelength').value} nm`;
    $('spectrum-swatch').style.background=wl.hex;
    $('spectrum-swatch').style.boxShadow=`0 0 12px ${wl.hex}`;
    $('spectrum-label').textContent=`${wl.name} · ${$('wavelength').value} nm`;
    drawScene();
  }

  function project(x,y,z,cx,cy,scale) {
    const elev=.48, ca=Math.cos(yaw), sa=Math.sin(yaw);
    const xr=x*ca-y*sa, yr=x*sa+y*ca;
    return [cx+scale*xr,cy-scale*(z*.17*Math.cos(elev)+yr*Math.sin(elev))];
  }

  function polygon(ctx,points,fill,stroke='#ffffffa8',line=1) {
    ctx.beginPath();points.forEach((point,i)=>i?ctx.lineTo(point[0],point[1]):ctx.moveTo(point[0],point[1]));ctx.closePath();
    ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}
  }

  function drawScene() {
    const canvas=$('scene'), rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const dpr=Math.min(devicePixelRatio||1,2),ctx=canvas.getContext('2d');
    canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
    const p=read(),cx=rect.width/2;
    const elev=.48,ca=Math.abs(Math.cos(yaw)),sa=Math.abs(Math.sin(yaw)),stackHeight=125*.17;
    const projectedWidth=ca*p.widthUm+sa*p.depthUm;
    const projectedDepth=sa*p.widthUm+ca*p.depthUm;
    const scale=Math.min(rect.width*.84/projectedWidth,rect.height*.84/(stackHeight*Math.cos(elev)+projectedDepth*Math.sin(elev)))*zoom;
    const cy=rect.height*.5+stackHeight*Math.cos(elev)*scale*.5;
    const x=p.widthUm/2,y=p.depthUm/2;
    const layers=[
      {name:'사파이어',z:0,h:31,color:'#dce6ee',w:1,d:1},
      {name:'버퍼·템플릿',z:31,h:13,color:'#9cb8cd',w:1,d:1},
      {name:'n-GaN:Si',z:44,h:23,color:'#6095ce',w:1,d:1},
      {name:'n-AlGaN / spacer',z:67,h:10,color:'#79addb',w:.92,d:.92},
      {name:'InGaN/GaN MQW',z:77,h:6,color:colorForWave(p.wavelengthNm).hex,w:.82,d:.82,glow:true},
      {name:'p-AlGaN EBL',z:83,h:8,color:'#cc8da9',w:.82,d:.82},
      {name:'p-GaN:Mg',z:91,h:20,color:'#75c4b5',w:.82,d:.82},
      {name:'ITO',z:111,h:6,color:'#41969a',w:.86,d:.86},
      {name:'p-metal',z:117,h:8,color:'#d6b752',w:.48,d:.48},
    ];
    const top=(z0,z1,wx,dy)=>[
      project(-x*wx,-y*dy,z1,cx,cy,scale),project(x*wx,-y*dy,z1,cx,cy,scale),
      project(x*wx,y*dy,z1,cx,cy,scale),project(-x*wx,y*dy,z1,cx,cy,scale),
    ];
    for(const layer of layers){
      const bottom=top(layer.z,layer.z,layer.w,layer.d),upper=top(layer.z+layer.h,layer.z+layer.h,layer.w,layer.d);
      const [p0,p1,p2,p3]=bottom,[t0,t1,t2,t3]=upper;
      const sides=[
        {points:[p0,p1,t1,t0],nx:0,ny:-1,color:'#667780'},
        {points:[p1,p2,t2,t1],nx:1,ny:0,color:'#758790'},
        {points:[p2,p3,t3,t2],nx:0,ny:1,color:'#8999a1'},
        {points:[p3,p0,t0,t3],nx:-1,ny:0,color:'#5d707a'},
      ].filter(side=>side.nx*Math.sin(yaw)+side.ny*Math.cos(yaw)>0)
        .sort((a,b)=>((a.nx*Math.sin(yaw)+a.ny*Math.cos(yaw))-(b.nx*Math.sin(yaw)+b.ny*Math.cos(yaw))));
      sides.forEach((side,i)=>polygon(ctx,side.points,layer.glow?['#d7a843','#bd8a34'][i%2]:side.color));
      polygon(ctx,upper,layer.color);
      const labelPt=project(x*layer.w,y*layer.d,layer.z+layer.h/2,cx,cy,scale);
      if(scale*Math.min(p.widthUm,p.depthUm)>.0 && layer.h>=8){
        ctx.fillStyle='#314753';ctx.font='600 10px system-ui,sans-serif';ctx.textAlign='left';
        if(layer.name==='n-GaN:Si'||layer.name==='p-GaN:Mg'||layer.name==='사파이어')ctx.fillText(layer.name,labelPt[0]+5,labelPt[1]);
      }
    }
    // Highlight the MQW perimeter as a translucent passivated sidewall shell.
    const mqw=layers[4],lo=top(mqw.z,mqw.z,.86,.86),hi=top(mqw.z+mqw.h,mqw.z+mqw.h,.86,.86);
    ctx.save();ctx.globalAlpha=.42;
    for(let i=0;i<4;i++)polygon(ctx,[lo[i],lo[(i+1)%4],hi[(i+1)%4],hi[i]],'#967fe0','#8067cf',1);
    ctx.restore();
    ctx.fillStyle='#53656e';ctx.font='700 11px system-ui,sans-serif';ctx.textAlign='left';ctx.fillText(`W ${p.widthUm} μm   ×   D ${p.depthUm} μm`,12,19);
    ctx.fillStyle='#6a7e85';ctx.font='10px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText('drag to rotate',cx,rect.height-12);
  }

  function prettyRate(value){if(value>=1e15)return (value/1e15).toPrecision(3)+' P';if(value>=1e12)return(value/1e12).toPrecision(3)+' T';if(value>=1e9)return(value/1e9).toPrecision(3)+' G';if(value>=1e6)return(value/1e6).toPrecision(3)+' M';if(value>=1e3)return(value/1e3).toPrecision(3)+' k';return value.toPrecision(3);}

  function photopicV(nm){const position=(nm-380)/10,index=Math.max(0,Math.min(photopic.length-2,Math.floor(position))),fraction=Math.max(0,Math.min(1,position-index));return photopic[index]+(photopic[index+1]-photopic[index])*fraction;}

  function run() {
    const p=read(),result=calculate(p,p.currentDensity,56);
    const area=(p.widthUm*1e-4)*(p.depthUm*1e-4),current=p.currentDensity*area;
    const cdA=result.eqe*683*photopicV(p.wavelengthNm)*hPlanck*cLight/(Math.PI*q*p.wavelengthNm*1e-9);
    const luminance=cdA*p.currentDensity*1e4;
    $('eqe').textContent=`${(result.eqe*100).toFixed(2)}%`;
    $('iqe').textContent=`${(result.iqe*100).toFixed(1)}%`;
    $('aside-value').textContent=`${result.sidewallA.toPrecision(3)} s⁻¹`;
    $('photons').textContent=prettyRate(current/q*result.eqe);
    $('cda').textContent=`${cdA.toPrecision(3)} cd/A`;
    $('luminance').textContent=prettyRate(luminance)+' cd/m²';
    $('heatmap-current').textContent=`J = ${p.currentDensity.toPrecision(3)} A/cm²`;
    $('outputs').hidden=false;$('prompt').hidden=true;
    $('status').textContent='계산 완료 · 입력을 바꾸면 결과가 숨겨집니다. 다시 실행해 주세요.';
    state={p,result};drawHeatmap();drawChart();
  }

  function heatColor(value,min,max) {
    const stops=[[30,64,175],[25,151,190],[72,192,139],[248,210,78],[198,55,47]];
    const t=max-min<1e-12?.5:Math.max(0,Math.min(1,(value-min)/(max-min)))*(stops.length-1);
    const i=Math.min(stops.length-2,Math.floor(t)),f=t-i;
    const rgb=stops[i].map((channel,index)=>Math.round(channel+(stops[i+1][index]-channel)*f));
    return `rgb(${rgb.join(',')})`;
  }

  function drawHeatmap() {
    const canvas=$('heatmap'),rect=canvas.getBoundingClientRect();if(!rect.width||!state)return;
    const dpr=Math.min(devicePixelRatio||1,2),ctx=canvas.getContext('2d');
    canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    const w=rect.width,h=rect.height,{p,result}=state,values=result.cells.map(cell=>cell.eqe),min=Math.min(...values),max=Math.max(...values);
    const margins={left:43,right:66,top:30,bottom:37},plotW=w-margins.left-margins.right,plotH=h-margins.top-margins.bottom;
    const scale=Math.min(plotW/p.widthUm,plotH/p.depthUm),mapW=p.widthUm*scale,mapH=p.depthUm*scale;
    const x0=margins.left+(plotW-mapW)/2,y0=margins.top+(plotH-mapH)/2,cw=mapW/result.columns,ch=mapH/result.rows;
    heatmapBounds={x:x0,y:y0,w:mapW,h:mapH,columns:result.columns,rows:result.rows};
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#f8fbfb';ctx.fillRect(0,0,w,h);
    result.cells.forEach((cell,index)=>{const col=index%result.columns,row=Math.floor(index/result.columns);ctx.fillStyle=heatColor(cell.eqe,min,max);ctx.fillRect(x0+col*cw,y0+row*ch,Math.ceil(cw+.2),Math.ceil(ch+.2));});
    ctx.strokeStyle='#344f5a';ctx.lineWidth=1.2;ctx.strokeRect(x0,y0,mapW,mapH);
    ctx.fillStyle='#64777f';ctx.font='10px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(`W = ${p.widthUm} μm`,x0+mapW/2,h-12);
    ctx.save();ctx.translate(13,y0+mapH/2);ctx.rotate(-Math.PI/2);ctx.fillText(`D = ${p.depthUm} μm`,0,0);ctx.restore();
    const barX=w-40,barY=y0,barH=mapH,barW=12,gradient=ctx.createLinearGradient(0,barY+barH,0,barY);
    gradient.addColorStop(0,heatColor(min,min,max));gradient.addColorStop(.25,heatColor(min+(max-min)*.25,min,max));gradient.addColorStop(.5,heatColor(min+(max-min)*.5,min,max));gradient.addColorStop(.75,heatColor(min+(max-min)*.75,min,max));gradient.addColorStop(1,heatColor(max,min,max));
    ctx.fillStyle=gradient;ctx.fillRect(barX,barY,barW,barH);ctx.strokeStyle='#83939a';ctx.strokeRect(barX,barY,barW,barH);
    ctx.fillStyle='#50636c';ctx.font='10px system-ui,sans-serif';ctx.textAlign='left';ctx.textBaseline='top';ctx.fillText(`${(max*100).toFixed(1)}%`,barX+16,barY);
    ctx.textBaseline='bottom';ctx.fillText(`${(min*100).toFixed(1)}%`,barX+16,barY+barH);
    ctx.textBaseline='top';ctx.textAlign='left';ctx.fillStyle='#71828a';ctx.fillText('국소 EQE',margins.left,y0-16);
    $('heat-min').textContent=`낮음 · ${(min*100).toFixed(2)}%`;$('heat-max').textContent=`높음 · ${(max*100).toFixed(2)}%`;
  }

  function readHeatmapPoint(event) {
    if(!state||!heatmapBounds)return;
    const rect=$('heatmap').getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,b=heatmapBounds;
    if(x<b.x||x>b.x+b.w||y<b.y||y>b.y+b.h){$('heatmap-readout').textContent='격자 위에 포인터를 올리면 위치별 EQE를 표시합니다.';return;}
    const col=Math.min(b.columns-1,Math.floor((x-b.x)/b.w*b.columns)),row=Math.min(b.rows-1,Math.floor((y-b.y)/b.h*b.rows));
    const cell=state.result.cells[row*b.columns+col];
    $('heatmap-readout').textContent=`x ${(cell.x*state.p.widthUm).toFixed(2)} μm · y ${(cell.y*state.p.depthUm).toFixed(2)} μm · 국소 EQE ${(cell.eqe*100).toFixed(3)}%`;
  }

  function drawChart() {
    const canvas=$('chart'),rect=canvas.getBoundingClientRect();if(!rect.width||!state)return;
    const dpr=Math.min(devicePixelRatio||1,2),ctx=canvas.getContext('2d');
    canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    const w=rect.width,h=rect.height,m={l:55,r:14,t:18,b:34},pw=w-m.l-m.r,ph=h-m.t-m.b;
    const points=[];for(let i=0;i<=80;i++){const j=10**(-1+4*i/80);points.push({j,eqe:calculate(state.p,j,12).eqe*100});}
    const maxY=Math.max(5,Math.ceil(Math.max(...points.map(v=>v.eqe))/5)*5),X=j=>m.l+(Math.log10(j)+1)/4*pw,Y=v=>m.t+ph-v/maxY*ph;
    ctx.clearRect(0,0,w,h);ctx.font='10px system-ui,sans-serif';ctx.textBaseline='middle';
    for(let i=0;i<=4;i++){const v=maxY*i/4,y=Y(v);ctx.strokeStyle='#e7eded';ctx.beginPath();ctx.moveTo(m.l,y);ctx.lineTo(w-m.r,y);ctx.stroke();ctx.fillStyle='#76868d';ctx.textAlign='right';ctx.fillText(`${v.toFixed(0)}%`,m.l-8,y);}
    [0.1,1,10,100,1000].forEach((j,i)=>{const x=X(j);ctx.strokeStyle='#f0f2f3';ctx.beginPath();ctx.moveTo(x,m.t);ctx.lineTo(x,m.t+ph);ctx.stroke();ctx.fillStyle='#76868d';ctx.textAlign=i===4?'right':'center';ctx.fillText(String(j),i===4?x-2:x,h-17);});
    ctx.beginPath();points.forEach((v,i)=>i?ctx.lineTo(X(v.j),Y(v.eqe)):ctx.moveTo(X(v.j),Y(v.eqe)));ctx.strokeStyle='#0b8b7d';ctx.lineWidth=3;ctx.lineJoin='round';ctx.stroke();
    const mark=state.result.eqe*100;ctx.beginPath();ctx.arc(X(state.p.currentDensity),Y(mark),5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=3;ctx.strokeStyle='#d68142';ctx.stroke();
  }

  document.querySelectorAll('input[type=range]').forEach(range=>{
    const number=range.parentElement.querySelector('.numeric');
    if(number){range.addEventListener('input',()=>{number.value=range.value;changed();});number.addEventListener('change',()=>{const value=Number(number.value),min=Number(range.min),max=Number(range.max),step=Number(range.step)||1;if(!Number.isFinite(value)){number.value=range.value;return;}range.value=String(Math.min(max,Math.max(min,min+Math.round((value-min)/step)*step)));number.value=range.value;changed();});}
    else range.addEventListener('input',changed);
  });
  function changed(){state=null;$('outputs').hidden=true;$('prompt').hidden=false;$('status').textContent='입력값을 설정한 뒤 실행하세요.';updateInputs();}
  $('run').addEventListener('click',run);
  $('heatmap').addEventListener('pointermove',readHeatmapPoint);
  $('heatmap').addEventListener('pointerleave',()=>{$('heatmap-readout').textContent='격자 위에 포인터를 올리면 위치별 EQE를 표시합니다.';});
  $('reset').addEventListener('click',()=>{for(const [id,value] of Object.entries(defaults))$(id).value=String(value);document.querySelectorAll('.numeric').forEach(input=>{input.value=$(input.parentElement.querySelector('input[type=range]').id).value;});changed();});
  $('rotate-left').addEventListener('click',()=>{yaw-=.2;drawScene();});$('rotate-right').addEventListener('click',()=>{yaw+=.2;drawScene();});
  $('zoom-in').addEventListener('click',()=>{zoom=Math.min(1.8,zoom*1.12);drawScene();});$('zoom-out').addEventListener('click',()=>{zoom=Math.max(.65,zoom/1.12);drawScene();});
  const canvas=$('scene');canvas.addEventListener('pointerdown',event=>{drag={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{if(!drag)return;yaw+=(event.clientX-drag.x)*.012;drag={x:event.clientX,y:event.clientY};drawScene();});
  canvas.addEventListener('pointerup',()=>{drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});
  canvas.addEventListener('wheel',event=>{event.preventDefault();zoom=Math.max(.65,Math.min(1.8,zoom*(event.deltaY<0?1.08:.92)));drawScene();},{passive:false});
  window.addEventListener('resize',()=>{drawScene();if(state){drawHeatmap();drawChart();}});
  updateInputs();
})();
