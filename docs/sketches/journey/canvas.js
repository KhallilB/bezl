// Preview canvas: takes as artboards you use, point at, draw on, record and compare.
Object.assign(S,{mode:"use",zoom:0,pan:{x:0,y:0},size:"wide",compare:false,ap:{},rec:null,recs:null,marks:[],drag:null});
const MODES=[["use","Use","U"],["point","Point","P"],["draw","Draw","D"],["record","Record","R"]];
const ART={wide:[560,600],narrow:[360,640]};
const apOf=k=>S.ap[k]||(S.ap[k]={dlg:false,name:"",projects:[]});
// Take A's dialog leaves focus on the button; B's focuses the name field. Replay exposes it.
const FOCUSES={A:false,B:true,C:true};
function appCanvas(k){const a=apOf(k),narrow=S.size==="narrow";
 if(!a.projects.length&&!a.dlg)return app(k,null,narrow);
 const list=a.projects.length?`<div class="tbl"><div class="th"><span>Name</span><span>Owner</span><span>Updated</span></div>${a.projects.map(n=>`<div class="th" style="color:#1b1f2a;font-size:12.5px" data-el="row" data-take="${k}"><span>${esc(n)}</span><span>You</span><span>just now</span></div>`).join("")}</div>`:null;
 let html=list?shell(list,0,narrow).replace('<div class="center">','<div>'):app(k,null,narrow);
 if(a.dlg)html=html.replace(/<\/div>$/,`<div class="dlg"><div class="dbox"><h4>New project</h4><label>Name</label><input id="in-${k}" data-el="name" data-take="${k}" value="${esc(a.name)}" placeholder="Project name" autocomplete="off"><div class="drow"><span class="ghostbtn" data-appact="cancel" data-take="${k}">Cancel</span><span class="cta" data-el="create" data-appact="create" data-take="${k}">Create</span></div></div></div></div>`);
 return html}
function artboard(k){const v=S.takes[k],[w,h]=ART[S.size],live=!ready(k),rec=S.rec&&S.rec.take===k;
 const over=S.compare?`<div class="over" style="clip-path:inset(0 ${100-S.slide}% 0 0)">${app("main",null,S.size==="narrow")}</div><i class="divider" style="left:${S.slide}%"></i><span class="tag" style="left:8px">Before</span><span class="tag" style="right:8px">After</span>`:"";
 return `<div class="art" style="width:${w}px"><div class="alab"><span class="tk">${k}</span><button class="who" data-menu="${k}">${M[v.model]} <i>▾</i></button><span class="st">${live?`<i class="dot d-live"></i>Building ${v.done}/${v.of}`:rec?`<i class="dot" style="--c:#ef5b65"></i>Recording`:"Ready"}</span>${S.menu===k?menu(k):""}</div>
 <div class="board ${live?"live":""} ${rec?"rec":""}" style="height:${h}px"><div class="vp mode-${S.mode}" data-art="${k}">${appCanvas(k)}${over}${S.compare?`<input type="range" value="${S.slide}" data-slide aria-label="Compare with main">`:""}
 ${S.marks.filter(m=>m.take===k).map(mark).join("")}${S.pins.filter(p=>p.take===k).map(pin).join("")}</div></div>
 <button class="ft" data-log="${k}" style="border:0;padding:8px 2px">${live?'<i class="dot d-live"></i>':""}${esc(v.log.at(-1))}</button></div>`}
function mark(m,i){const n=S.marks.indexOf(m);
 return `<div class="mark ${m.state}" style="left:${m.x}px;top:${m.y}px;width:${m.w}px;height:${m.h}px"></div>${m.state==="drawing"?"":`<div class="pin ${m.state==="open"?"":m.state}" style="left:${m.x}px;top:${m.y+m.h+6}px">${m.state==="open"?`<span class="num">✎</span><input id="markin" placeholder="What should change in this area?">`:`<span class="num">${m.state==="done"?"✓":"✎"}</span><span>${m.state==="work"?M[S.takes[m.take].model]+" is on it…":"Updated the area you marked"}</span>${m.state==="done"?`<button class="link" data-unmark="${n}">Undo</button>`:""}`}</div>`}`}
function toolbar(){const z=Math.round(S.zoom*100);
 return `<div class="ctool"><span class="seg">${MODES.map(([m,l,key])=>`<button data-mode="${m}" class="${S.mode===m?"on":""}" title="${l} (${key})">${m==="record"?'<i class="rdot"></i>':""}${l}</button>`).join("")}</span><i class="vsep"></i>
 <button class="tbtn ${S.compare?"on":""}" data-compare title="Compare with main">Compare</button><span class="seg"><button data-vsize="wide" class="${S.size==="wide"?"on":""}">Wide</button><button data-vsize="narrow" class="${S.size==="narrow"?"on":""}">Narrow</button></span><i class="vsep"></i>
 <button class="tbtn" data-zoom="-1" aria-label="Zoom out">−</button><button class="tbtn" data-zoom="fit" title="Fit all takes">${z}%</button><button class="tbtn" data-zoom="1" aria-label="Zoom in">+</button></div>`}
function recCard(){const r=S.rec||S.recs;if(!r)return"";const live=S.rec&&!S.recs;
 if(live)return `<div class="rcard live"><div class="row"><i class="dot" style="--c:#ef5b65"></i><b style="font-weight:500">Recording take ${r.take}</b><span class="sub">${r.steps.length} steps</span>${btn("Stop","primary","data-recstop")}</div><div class="sub">Use the preview as a person would. Every click and entry is captured.</div></div>`;
 const res=r.results;
 return `<div class="rcard"><div class="row"><b style="font-weight:500">Recorded flow</b><span class="sub">take ${r.take} · ${r.steps.length} steps</span><button class="link" data-recdrop style="margin-left:auto">Discard</button></div>
 <div class="rsteps">${r.steps.map((st,i)=>`<div class="rstep"><span class="n">${i+1}</span><span>${esc(st.text)}${st.note?`<span class="rnote">Expect: ${esc(st.note)}</span>`:""}${r.noting===i?`<input id="recnote" placeholder="What should be true after this step?">`:""}</span>${res?`<span class="rres">${Object.keys(res).map(k=>{const ok=res[k][i]!==false;return `<i class="${ok?"ok":"bad"}" title="Take ${k}">${k}</i>`}).join("")}</span>`:`<button class="link" data-recnote="${i}">${st.note?"Edit":"Note"}</button>`}</div>`).join("")}</div>
 ${res?`<div class="sub">${Object.keys(res).map(k=>res[k].includes(false)?`Take ${k} fails at step ${res[k].indexOf(false)+1}`:`Take ${k} passes`).join(" · ")}</div><div class="row">${Object.keys(res).filter(k=>res[k].includes(false)).map(k=>btn(`Send the failure to ${M[S.takes[k].model]}`,"primary",`data-recsend="${k}"`)).join("")}${btn(r.saved?"Saved as a test":"Save as a test","secondary","data-recsave")}</div>`
 :`<div class="row">${btn(`Replay on all ${keys().length} takes`,"primary","data-replay")}${btn(r.saved?"Saved as a test":"Save as a test","secondary","data-recsave")}</div>`}</div>`}
V.Build=()=>`<div class="canvas fill ${S.drag&&S.drag.kind==="pan"?"panning":""}" data-canvas>${toolbar()}<div class="world" style="transform:translate(${S.pan.x}px,${S.pan.y}px) scale(${S.zoom})">${keys().map(artboard).join("")}${keys().length<3?`<button class="addtake art" data-addtake style="width:${ART[S.size][0]*.6}px;height:${ART[S.size][1]}px;margin-top:34px"><b>+</b>Add a take<span class="sub">Another model, same plan</span></button>`:""}</div>${recCard()}
 ${S.mode!=="use"&&!S.rec?`<div class="hint">${{point:"Click an element to say what should change.",draw:"Drag a box around an area.",record:"Start using any take; Bezl records each step."}[S.mode]}</div>`:""}</div>`;
// Zoom to fit all artboards in the canvas.
function fit(){const c=document.querySelector("[data-canvas]");if(!c)return;const n=keys().length+(keys().length<3?.6:0),[w,h]=ART[S.size],W=n*w+(Math.ceil(n)-1)*48+96,H=h+150;
 S.zoom=Math.min(1,(c.clientWidth)/W,(c.clientHeight)/H);S.pan={x:Math.max(24,(c.clientWidth-W*S.zoom)/2+48*S.zoom),y:72}}
const _draw=draw;draw=function(f){_draw(f);if(S.stage==="Build"&&!S.zoom){fit();_draw(f)}};
function local(e,vp){const r=vp.getBoundingClientRect();return [(e.clientX-r.left)/S.zoom,(e.clientY-r.top)/S.zoom]}
function recStep(k,text){if(S.mode!=="record"||S.recs)return;if(!S.rec)S.rec={take:k,steps:[]};if(S.rec.take!==k)return;S.rec.steps.push({text})}
document.addEventListener("click",e=>{const t=e.target,b=t.closest("button"),d=b?b.dataset:{};
 if(d.mode){S.mode=d.mode;S.pins=S.pins.filter(p=>p.state!=="open");draw();return}
 if(d.compare!==undefined){S.compare=!S.compare;draw();return}
 if(d.vsize){S.size=d.vsize;S.zoom=0;draw();return}
 if(d.zoom){if(d.zoom==="fit"){S.zoom=0}else S.zoom=Math.max(.3,Math.min(1.6,S.zoom+(+d.zoom)*.1));draw();return}
 if(d.recstop!==undefined){S.recs=S.rec;S.rec=null;S.mode="use";draw();return}
 if(d.recdrop!==undefined){S.rec=null;S.recs=null;draw();return}
 if(d.recnote){S.recs.noting=+d.recnote;draw();document.getElementById("recnote")?.focus();return}
 if(d.replay!==undefined){const r=S.recs;r.results=null;flash(`Replaying on ${keys().length} takes…`);setTimeout(()=>{r.results={};for(const k of keys())r.results[k]=r.steps.map(st=>!(st.note&&/focus/i.test(st.note))||FOCUSES[k]);draw()},1400);return}
 if(d.recsave!==undefined){S.recs.saved=true;flash("Saved as a test. Bezl runs it on every take after each step.");return}
 if(d.recsend){const k=d.recsend;S.takes[k].log.push("You: the recorded flow fails at step 1");flash(`Sent to ${M[S.takes[k].model]} with the recording and the failing step.`);return}
 if(d.unmark){S.marks.splice(+d.unmark,1);draw();return}
 // Inside a preview: behaviour depends on the mode.
 const vp=t.closest("[data-art]");if(!vp||S.compare)return;const k=vp.dataset.art,el=t.closest("[data-el]"),act=t.closest("[data-appact]"),a=apOf(k);
 if(S.mode==="point"&&el&&!t.closest(".pin")){const [x,y]=local(e,vp),r=el.getBoundingClientRect(),vr=vp.getBoundingClientRect();S.pins=S.pins.filter(p=>p.state!=="open");S.pins.push({take:k,el:el.dataset.el,x:Math.max(8,(r.left-vr.left)/S.zoom),y:(r.bottom-vr.top)/S.zoom+6,state:"open"});draw();return}
 if(S.mode==="use"||S.mode==="record"){
  if(el&&el.dataset.el==="cta"&&!a.dlg){a.dlg=true;a.name="";recStep(k,`Click “${S.takes[k].t.cta}”`);draw();if(FOCUSES[k])document.getElementById("in-"+k)?.focus();return}
  if(act&&act.dataset.appact==="cancel"){a.dlg=false;recStep(k,"Click “Cancel”");draw();return}
  if(act&&act.dataset.appact==="create"){if(a.name.trim())recStep(k,`Type “${a.name.trim()}” in Name`);recStep(k,"Click “Create”");a.projects.push(a.name.trim()||"Untitled");a.dlg=false;recStep(k,`See “${a.projects.at(-1)}” in the list`);draw();return}}});
document.addEventListener("input",e=>{const m=e.target.id.match(/^in-(\w)$/);if(m)apOf(m[1]).name=e.target.value});
document.addEventListener("keydown",e=>{
 if(e.target.id==="markin"&&e.key==="Enter"){const m=S.marks.find(x=>x.state==="open");if(m&&e.target.value.trim()){m.state="work";S.takes[m.take].log.push("You marked an area");draw();setTimeout(()=>{m.state="done";S.takes[m.take].log.push("Updated the marked area");draw()},1800)}return}
 if(e.target.id==="recnote"&&e.key==="Enter"){const r=S.recs;r.steps[r.noting].note=e.target.value.trim();r.noting=null;r.results=null;draw();return}
 if(/^(INPUT|TEXTAREA)$/.test(e.target.tagName))return;
 const m={u:"use",p:"point",d:"draw",r:"record"}[e.key.toLowerCase()];if(m&&!e.metaKey&&!e.ctrlKey){S.stage="Build";S.mode=m;draw()}
 if(e.key==="Escape"){S.mode="use";S.marks=S.marks.filter(x=>x.state!=="open"&&x.state!=="drawing");draw()}});
// Drag: draw a box in Draw mode, otherwise pan the canvas from empty space.
document.addEventListener("mousedown",e=>{const c=e.target.closest("[data-canvas]");if(!c||e.button!==0||e.target.closest(".ctool,.rcard,button,input,.pin"))return;
 const vp=e.target.closest("[data-art]");
 if(S.mode==="draw"&&vp){const [x,y]=local(e,vp);S.marks=S.marks.filter(m=>m.state!=="open");const m={take:vp.dataset.art,x,y,w:0,h:0,state:"drawing"};S.marks.push(m);S.drag={kind:"draw",m,x0:x,y0:y,vp};e.preventDefault();draw();return}
 if(!vp){S.drag={kind:"pan",sx:e.clientX,sy:e.clientY,px:S.pan.x,py:S.pan.y};e.preventDefault()}});
document.addEventListener("mousemove",e=>{const g=S.drag;if(!g)return;
 if(g.kind==="pan"){S.pan={x:g.px+e.clientX-g.sx,y:g.py+e.clientY-g.sy};const w=document.querySelector(".world");if(w)w.style.transform=`translate(${S.pan.x}px,${S.pan.y}px) scale(${S.zoom})`;return}
 const vp=document.querySelector(`[data-art="${g.m.take}"]`),[x,y]=local(e,vp);Object.assign(g.m,{x:Math.min(x,g.x0),y:Math.min(y,g.y0),w:Math.abs(x-g.x0),h:Math.abs(y-g.y0)});const el=vp.querySelector(".mark.drawing");if(el)Object.assign(el.style,{left:g.m.x+"px",top:g.m.y+"px",width:g.m.w+"px",height:g.m.h+"px"})});
document.addEventListener("mouseup",()=>{const g=S.drag;S.drag=null;if(g&&g.kind==="draw"){if(g.m.w<12||g.m.h<12)S.marks.pop();else g.m.state="open";draw();document.getElementById("markin")?.focus()}});
document.addEventListener("wheel",e=>{if(!e.target.closest("[data-canvas]")||S.stage!=="Build")return;e.preventDefault();if(e.ctrlKey||e.metaKey){S.zoom=Math.max(.3,Math.min(1.6,S.zoom*(1-e.deltaY*.01)))}else{S.pan={x:S.pan.x-e.deltaX,y:S.pan.y-e.deltaY}}draw()},{passive:false});
addEventListener("resize",()=>{S.zoom=0;draw()});
draw();
