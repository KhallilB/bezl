// Calm journey sketch: one focal object per stage, everything else on demand.
const M={claude:"Claude Code",codex:"Codex",local:"Local model"};
const other=m=>m==="claude"?"codex":"claude";
const STAGES=["Brief","Explore","Plan","Build","Check","Review","Ship"];
const PART={illus:"illustration",title:"headline",body:"explanation",cta:"one primary button",list:"3-step checklist",cards:"template cards",imp:"import first",blank:"start blank",link:"import link"};
const S={stage:"Build",point:false,pins:[],menu:null,log:null,cmp:null,slide:50,picked:null,showAll:false,tick:0,nt:false,ntText:"",ntRef:false,
 ans:{who:0,first:0,tone:0},stale:false,keep:{"1:illus":1,"1:cta":1,"2:list":1},
 dirs:[{n:1,name:"Illustrated welcome",by:"claude",parts:["illus","title","body","cta","link"],take:"A"},{n:2,name:"Getting-started checklist",by:"codex",parts:["title","list","cta"],take:"B"},{n:3,name:"Template gallery",by:"codex",parts:["title","cards","cta"]},{n:4,name:"Import first",by:"local",parts:["title","imp","blank"],drop:1}],
 takes:{A:{model:"claude",style:"illus",done:2,of:5,t:{title:"No projects yet",body:"Projects keep your files, people and deadlines in one place.",cta:"New project",link:"Import from GitHub"},log:["Read Projects.tsx and EmptyState.tsx","Built the empty state","Wiring “New project” to the create dialog"]},
        B:{model:"codex",style:"checklist",done:5,of:5,t:{title:"Start your first project",cta:"New project"},log:["Read Projects.tsx","Built a getting-started checklist","Added 3 tests","Done, sent to Claude Code for review"]}}};
const ASK=[["who","new users",["new users","invited teammates"]],["first","create a project",["create a project","import"]],["tone","friendly",["friendly","plain"]]];
const keys=()=>Object.keys(S.takes),ready=k=>S.takes[k].done>=S.takes[k].of,allReady=()=>keys().every(ready);
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
const btn=(l,v="secondary",a="")=>`<button class="kb-button" data-variant="${v}" data-size="sm" ${a}>${l}</button>`;
const ICON={point:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2l10 5-4.5 1.5L7 13z"/></svg>',cmp:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="2"/><path d="M8 2v12"/></svg>'};
function state(s){const r=allReady();return {Brief:"done",Explore:"done",Plan:"done",Build:r?"done":"live",Check:r?"done":"live",Review:S.picked?"done":r?"you":"",Ship:S.picked?"you":""}[s]}
function statusLine(){const r=allReady(),k=keys();
 return {Brief:"<b>Ready to start.</b> Everything a model needs is here.",
  Explore:`<b>${S.dirs.length} sketches, ${Object.keys(S.keep).length} keepers.</b> Click any part to keep it.`,
  Plan:`<b>${k.length} plans,</b> one per take. You approved them at 10:06.`,
  Build:r?`<b>${k.length===2?"Both":"All "+k.length} takes are ready.</b> Point at anything to change it.`:`<b>Building ${k.length} takes.</b> ${k.filter(x=>!ready(x)).map(x=>`Take ${x} is on step ${S.takes[x].done+1} of ${S.takes[x].of}.`).join(" ")}`,
  Check:r?"<b>2 things need a look.</b> Everything else passed.":"<b>Checking as takes finish.</b>",
  Review:S.picked?`<b>You kept take ${S.picked}.</b>`:r?"<b>Which take should ship?</b> Each was reviewed by the other provider.":"<b>Waiting for the takes to finish.</b>",
  Ship:S.picked?"<b>Ready to ship.</b>":"<b>Pick a take at review first.</b>"}[S.stage]}
function sidebar(){const T=[["Empty state for Projects",S.picked?"d-attn":allReady()?"d-attn":"d-live",1],["Deny empty scopes","d-attn"],["Debounce terminal resize","d-live"],["Terminal snapshot","d-bad"]];
 return `<aside class="side"><div class="brand"><span class="mk"></span>Bezl</div><button class="t new" data-nt>+ New task</button>
 ${T.map(([n,d,on])=>`<button class="t ${on?"on":""}" ${on?"":"data-other"}><i class="dot ${d}"></i><span>${n}</span></button>`).join("")}
 <div class="sfoot" title="Usage of each provider's limit"><span>Claude <b>64%</b></span><span>Codex <b>22%</b></span></div></aside>`}
function pills(){return `<nav class="pills">${STAGES.map((s,i)=>{const st=state(s);return `${i?'<i class="sep"></i>':""}<button class="pill ${st} ${S.stage===s?"on":""}" data-stage="${s}"><span class="n">${st==="done"?"✓":st==="you"?"!":i+1}</span>${s}</button>`}).join("")}</nav>`}
// The user's product, per take.
// The user's product around the previewed content, so previews read as real pages.
function shell(body,table,narrow){return `<div class="app ${narrow?"narrow":""}"><div class="appn"><b>Studio</b><span class="srch">Search</span><i class="av2"></i></div><nav class="aside"><span>Home</span><span class="on">Projects</span><span>People</span><span>Settings</span></nav><main class="appb"><div class="aph"><h3>Projects</h3><span class="ghostbtn">+ New</span></div>${table?`<div class="tbl"><div class="th"><span>Name</span><span>Owner</span><span>Updated</span></div><div class="none">No data</div></div>`:`<div class="center">${body}</div>`}</main></div>`}
function app(k,hl,narrow){if(k==="main")return shell(`<div class="tbl">No data</div>`,1);
 const v=S.takes[k],t=v.t,el=(id,h)=>h.replace(/^<(\w+)/,`<$1 data-el="${id}" data-take="${k}"`);
 if(v.done<2&&v.style!=="illus"&&v.style!=="checklist")return `<div class="building"><div class="skel"><i></i><i style="width:80%"></i><i style="width:60%"></i></div></div>`;
 const list=`<div class="chk2 ${hl==="list"?"hl-target":""}"><div><i></i>Name your project</div><div><i></i>Invite your team</div><div><i></i>Add your first file</div></div>`;
 const body=hl==="card"&&v.style==="checklist"?`<div class="card2 hl-target">${el("title",`<h4>${esc(t.title)}</h4>`)}${list}${el("cta",`<span class="cta">${esc(t.cta)}</span>`)}</div>`:v.style==="illus"?`<div class="empty"><div class="illus"><i></i><i></i><i></i></div>${el("title",`<h4>${esc(t.title)}</h4>`)}${el("body",`<p>${esc(t.body)}</p>`)}${el("cta",`<span class="cta">${esc(t.cta)}</span>`)}${el("link",`<span class="lnk">${esc(t.link)}</span>`)}</div>`
  :v.style==="checklist"?`<div class="card2">${el("title",`<h4>${esc(t.title)}</h4>`)}${list}${el("cta",`<span class="cta">${esc(t.cta)}</span>`)}</div>`
  :`<div class="empty"><div class="illus"><i></i><i></i><i></i></div>${el("title",`<h4>${esc(t.title)}</h4>`)}${list}${el("cta",`<span class="cta">${esc(t.cta)}</span>`)}</div>`;
 return shell(body,0,narrow)}
function frame(k,foot){const v=S.takes[k],live=!ready(k),cmp=S.cmp===k;
 const vp=cmp?`<div class="vp"><span class="tag" style="left:8px">Before</span><span class="tag" style="right:8px">After</span>${app(k)}<div class="over" style="clip-path:inset(0 ${100-S.slide}% 0 0)">${app("main")}</div><i class="divider" style="left:${S.slide}%"></i><input type="range" value="${S.slide}" data-slide aria-label="Compare with main"></div>`
  :`<div class="vp ${S.point?"pointing":""}" data-frame="${k}">${app(k)}${S.stage==="Build"?S.pins.filter(p=>p.take===k).map(pin).join(""):""}</div>`;
 return `<div class="fr ${live?"live":""}"><div class="fh"><span class="tk">${k}</span><button class="who" data-menu="${k}">${M[v.model]} <i>▾</i></button>
  <span class="st">${live?`<i class="dot d-live"></i>${v.done}/${v.of}`:"Ready"}${foot?"":`<button class="icon ${cmp?"on":""}" data-cmp="${k}" title="Compare with main">${ICON.cmp}</button><button class="icon ${S.point?"on":""}" data-point title="Point to change (P)">${ICON.point}</button>`}</span>
  ${S.menu===k?menu(k):""}</div>${vp}
  ${foot||`<button class="ft" data-log="${k}">${live?'<i class="dot d-live"></i>':""}${esc(v.log.at(-1))}</button>${S.log===k?`<div class="log">${v.log.slice(0,-1).reverse().map(l=>`<span>${esc(l)}</span>`).join("")}</div>`:""}`}</div>`}
function menu(k){return `<div class="menu">${["claude","codex","local"].map(m=>`<button class="opt" data-swap="${k}:${m}" ${m==="local"?"disabled":""}><b>${M[m]}${S.takes[k].model===m?" ✓":""}</b><span>${m==="local"?"Can sketch, can't write code":m===S.takes[k].model?"Writing this take":`Takes over from the same plan`}</span></button>`).join("")}</div>`}
function pin(p){const n=S.pins.indexOf(p)+1;
 if(p.state==="open")return `<div class="pin" style="left:${p.x}px;top:${p.y}px"><span class="num">${n}</span><input id="pinin" placeholder='What should change? Quote exact text'></div>`;
 return `<div class="pin ${p.state}" style="left:${p.x}px;top:${p.y}px"><span class="num">${p.state==="done"?"✓":n}</span><span>${p.state==="work"?M[S.takes[p.take].model]+" is on it…":esc(p.result)}</span>${p.state==="done"?`<button class="link" data-unpin="${n-1}">Undo</button>`:""}</div>`}
const V={};
const SKETCH=`<svg viewBox="0 0 400 300" fill="none" stroke="#3b3a36" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 24 L380 22 L378 278 L24 280 Z"/><path d="M24 58 L378 56"/><path d="M40 40h40M100 41h34M150 40h30"/><path d="M60 90h70" stroke-width="3"/><path d="M116 120 L284 118 L286 236 L114 238 Z"/><circle cx="200" cy="146" r="16"/><path d="M160 178h80M150 192h100"/><path d="M168 206 L232 205 L233 224 L167 225 Z" stroke="#3a5bdc" stroke-width="2.5"/><path d="M300 200 C330 190 340 170 336 150" stroke="#c0392b"/><path d="M330 156l6-8 4 10" stroke="#c0392b"/><text x="296" y="222" font-family="Geist, sans-serif" font-size="13" fill="#c0392b" stroke="none">one button!</text></svg>`;
V.Brief=()=>`<div class="split fill"><div class="stack"><div class="quote">“When someone has no projects yet, the Projects page should help them start one instead of showing an empty table.”</div>
 <div><p class="h2">Done when</p><div class="list">${[["The empty state shows when there are no projects","tests"],["One clear way to create the first project","review"],["Passes accessibility checks","checks"],["Existing tests still pass","checks"]].map(([d,w])=>`<div class="li" style="--c:var(--kb-color-success)"><span class="ic">✓</span><span>${d}</span><span class="sub">${w}</span></div>`).join("")}</div></div>
 <div><p class="h2">Found in the code</p><div class="list"><div class="li"><span class="ic sub">→</span><span><code>Projects.tsx</code> shows “No data” when empty</span><span></span></div><div class="li"><span class="ic sub">→</span><span><code>EmptyState</code> exists; Inbox and Files use it</span><span></span></div></div></div>
 <div class="row sub"><span>For new users · reuse <code>EmptyState</code></span><button class="link" data-nt>Edit</button></div></div>
 <div class="sketch">${SKETCH}<div class="cap">Your sketch · attached to every model's brief</div></div></div>`;
function wire(d){const P=k=>{const on=S.keep[d.n+":"+k];const inner={illus:'<i class="wc"></i>',title:'<i class="wl" style="width:52%;height:8px"></i>',body:'<i class="wl" style="width:70%"></i><i class="wl" style="width:56%"></i>',cta:'<i class="wb"></i>',link:'<i class="wl" style="width:28%;opacity:.6"></i>',list:'<div class="wlist"><i></i><i></i><i></i></div>',cards:'<div class="wcards"><i></i><i></i><i></i></div>',imp:'<i class="wb" style="width:58%"></i>',blank:'<i class="wb ghost" style="width:42%"></i>'}[k];
  return `<div class="wp ${on?"liked":""}" data-part="${k}" data-dir="${d.n}" title="Keep the ${PART[k]}">${inner}</div>`};return `<div class="wire">${d.parts.map(P).join("")}</div>`}
V.Explore=()=>{const kept=Object.keys(S.keep),from=new Set(kept.map(k=>k.split(":")[0])),blend=S.dirs.find(d=>d.n===5);
 const c=k=>{const a=ASK.find(x=>x[0]===k);return `<button class="choice" data-ans="${k}">${a[2][S.ans[k]]}</button>`};
 return `<div class="sentence">For ${c("who")}, who should ${c("first")} first, in a ${c("tone")} tone. ${S.stale?`<button class="link" data-redraft style="color:var(--live)">Redraft sketches</button>`:""}</div>
 <div class="sketches" style="grid-template-columns:repeat(${Math.max(4,S.dirs.length)},minmax(0,1fr))">${S.dirs.map(d=>`<div class="sk ${d.drop?"drop":""} ${d.n===5?"fresh":""}"><div class="nm"><b style="font-weight:500">${d.name}</b></div>${S.redrafting?'<div class="wire"><span class="sub">Redrafting…</span></div>':wire(d)}<div class="nm"><span style="margin-left:0">${M[d.by]}</span><span>${d.take?`Take ${d.take} `:""}<span class="acts">${d.take?"":`<button class="link" data-build="${d.n}">Build</button> · `}<button class="link" data-drop="${d.n}">${d.drop?"Restore":"Drop"}</button></span></span></div></div>`).join("")}</div>
 ${kept.length?`<div class="keepbar"><span>${kept.length} keepers from ${from.size} sketch${from.size>1?"es":""}</span><span class="row">${from.size>1&&!blend?btn("Blend them","primary","data-blend"):""}${blend&&!blend.take?btn("Build the blend","primary",'data-build="5"'):""}</span></div>`:""}`};
V.Plan=()=>`<div class="frames" style="--n:${keys().length}">${keys().map(k=>{const P={A:["Reuse EmptyState","Illustration and explanation","Wire “New project”","Import from GitHub link","Tests"],B:["GettingStarted card","Three-step checklist","Wire “New project”","Hide once a project exists","Tests"]}[k]||["Blend the welcome and checklist","Wire “New project”","Tests","Accessibility pass"];
 return `<div class="stack"><div class="thumb">${app(k)}</div><p class="h2">Take ${k} · ${M[S.takes[k].model]}</p><div class="list">${P.map((s,i)=>{const d=i<S.takes[k].done;return `<div class="li" style="--c:${d?"var(--kb-color-success)":"var(--mut)"}"><span class="ic">${d?"✓":i+1}</span><span class="${d?"":"mut"}">${s}</span><span></span></div>`}).join("")}</div></div>`}).join("")}</div>`;
V.Build=()=>`<div class="frames fill" style="--n:${Math.min(3,keys().length+(keys().length<3?1:0))}">${keys().map(k=>frame(k)).join("")}${keys().length<3?`<button class="addtake" data-addtake><b>+</b>Add a take<span class="sub">Another model, same plan</span></button>`:""}</div>`;
V.Check=()=>{if(!allReady())return `<div class="sub">Results appear here as each take finishes.</div>`;
 const issues=[["B","Checklist text is too faint","Contrast 2.6:1; it needs 4.5:1","list"],["B","Adds a new card instead of reusing EmptyState","2 other pages use EmptyState","card"]],i=S.issue||0,[k,t,sub,hl]=issues[i];
 const score=keys().map(x=>{const bad=x==="B"?2:0;return `<span class="chip ${bad?"warn":""}">Take ${x} <b>${6-bad} of 6</b></span>`}).join("");
 const ev=i===0?`<div class="sw"><i style="color:#9aa0ad">Aa</i><span>Now <code>#9AA0AD</code> on white</span><b style="color:var(--kb-color-danger)">2.6:1</b><i style="color:#5a6070">Aa</i><span>Suggested <code>#5A6070</code>, the page's body text</span><b style="color:var(--kb-color-success)">6.3:1</b></div>`
  :`<div class="row" style="align-items:stretch"><div class="codebox" style="flex:1"><b>Take B adds</b>\ncomponents/GettingStarted.tsx  +48\n&lt;GettingStarted steps={3} /&gt;</div><div class="codebox" style="flex:1"><b>Already in the code</b>\ncomponents/EmptyState.tsx\nused by Inbox, Files</div></div>`;
 return `<div class="split fill"><div class="stack"><div class="chips">${score}</div><div>${issues.map(([x,tt,sb],j)=>`<button class="issue ${j===i?"on":""}" data-issue="${j}"><span class="ic">!</span><span>${tt} <span class="sub">· take ${x}</span></span><span class="sub">${sb}</span></button>`).join("")}</div>
  <div><p class="h2">Checked at two sizes</p><div class="row" style="align-items:flex-start"><div class="thumb" style="flex:3;height:150px">${app(k,hl)}</div><div class="thumb" style="flex:1;height:150px">${app(k,hl,1)}</div></div></div>
  <button class="link" data-showall>${S.showAll?"Hide":"Show"} all ${6*keys().length} checks</button>${S.showAll?`<div class="list">${["Build","Tests","Accessibility","Visual change","Design system","Lint"].map(c=>`<div class="li"><span class="ic sub">·</span><span>${c}</span><span class="sub">${keys().map(x=>`${x} ${x==="B"&&(c==="Accessibility"||c==="Design system")?"<b style='color:var(--attn)'>!</b>":"✓"}`).join("&nbsp;&nbsp;")}</span></div>`).join("")}</div>`:""}</div>
 <div class="evid"><div class="vp">${app(k,hl)}</div><div class="foot">${ev}<div class="row">${btn(i===0?"Ask Codex to use the suggested colour":"Ask Codex to reuse EmptyState","primary",`data-fix="${k}"`)}<span class="sub">Codex gets this evidence with the file and line.</span></div></div></div></div>`};
V.Review=()=>{if(S.picked)return `<div class="row">${btn("Undo","ghost","data-unpick")}</div>`;if(!allReady())return "";
 const R={A:"Clear, reuses EmptyState. The import link has no handler yet.",B:"Good guidance, but the checklist fails contrast.",C:"One action plus guidance, reuses EmptyState."};
 return `<div class="frames fill" style="--n:${keys().length}">${keys().map(k=>frame(k,`<div class="ft" style="cursor:default;display:grid;gap:8px;justify-items:start"><span><b style="color:var(--kb-color-fg);font-weight:500">${M[other(S.takes[k].model)]}:</b> ${R[k]}</span>${btn(`Keep take ${k}`,k==="A"?"primary":"secondary",`data-pick="${k}"`)}</div>`)).join("")}</div>
 ${keys().includes("B")&&!S.takes.C?`<button class="link" data-combine>Or combine: A's layout with B's checklist</button>`:""}`};
V.Ship=()=>{if(!S.picked)return "";const k=S.picked,v=S.takes[k];
 return `<div class="split fill"><div class="stack"><div style="font:500 20px/1.35 var(--sans)">Add an empty state to the Projects page</div>
  <div class="sub" style="font-size:14px;line-height:1.6">Take ${k} by ${M[v.model]}, reviewed by ${M[other(v.model)]}. Reuses <code>EmptyState</code> with one action, “${esc(v.t.cta)}”.</div>
  <div class="chips"><span class="chip">Checks <b>6 of 6</b></span><span class="chip">Reviewed by <b>${M[other(v.model)]}</b></span><span class="chip">From <b>Illustrated welcome</b></span></div>
  <div><p class="h2">What changed</p><div class="list files">${[["src/pages/Projects.tsx","+31 −4"],["src/components/EmptyState.tsx","+12 −0"],["src/pages/Projects.test.tsx","+43 −0"]].map(([f,n])=>`<div class="li"><code>${f}</code><span class="sub">${n}</span></div>`).join("")}</div></div>
  <div><p class="h2">How it got here · goes into the description</p><div class="list">${[["Brief","For new users, reuse EmptyState, one button"],["Explore",`${S.dirs.length} sketches; you kept the illustration and one button`],["Build",`${keys().length} takes by Claude Code and Codex; you changed the button text`],["Check","Take B had 2 issues; take "+k+" passed all 6"],["Review",`${M[other(v.model)]}: “Clear, reuses EmptyState”`]].map(([st,t])=>`<div class="li"><span class="ic" style="color:var(--kb-color-success)">✓</span><span><b style="font-weight:500">${st}</b> <span class="sub">· ${t}</span></span><span></span></div>`).join("")}</div></div>
  <div class="row">${btn("Open pull request","primary","data-pr")}<button class="link" data-stage="Review">Back to review</button></div></div>
 <div class="fr"><div class="fh"><span class="tk">${k}</span><b style="font-weight:500">${M[v.model]}</b><span class="st">Kept</span></div><div class="vp">${app(k)}</div><div class="ft" style="cursor:default">localhost:5174/projects</div></div></div>`};
function newTask(){const t=S.ntText,R=[["Who it's for",/(user|someone|team|people|customer)/i.test(t),"for new users after sign-up"],["Done when",/(done when|should|must)/i.test(t),"Done when it shows with no projects and passes accessibility checks."],["Constraints",/(reuse|don't|keep|without)/i.test(t),"Reuse EmptyState."],["Reference",S.ntRef]];const n=R.filter(r=>r[1]).length+(t.trim().length>20?1:0);
 return `<div style="position:fixed;inset:0;z-index:40;display:grid;place-items:start center;padding-top:110px;background:color-mix(in oklab,var(--kb-color-bg) 65%,transparent);backdrop-filter:blur(6px)"><div class="box" style="width:560px;display:grid;gap:12px;background:var(--kb-color-surface)">
 <textarea id="nt" rows="3" placeholder="What do you want? Plain words are fine." style="all:unset;font:17px/1.5 var(--sans);min-height:80px">${esc(t)}</textarea>
 <div class="row sub">${n} of 5 ready${R.filter(r=>!r[1]).map(([l,_,add])=>` · <button class="link" ${add?`data-ntadd="${esc(add)}"`:"data-ntref"} title="${add?esc(add):"Attach a sketch"}">+ ${l}</button>`).join("")}</div>
 <div class="row"><button class="link" data-ntclose>Cancel</button><span style="margin-left:auto">${btn("Start",n>=3?"primary":"secondary","data-ntstart")}</span></div></div></div>`}
function view(){return sidebar()+`<main class="main"><div class="col"><div class="top"><div class="title"><h1>Empty state for Projects</h1><span class="sub">studio-web</span></div>${pills()}<div class="status">${statusLine()}</div></div>${V[S.stage]()}</div></main>`
 +(S.stage==="Build"?`<div class="comp"><input id="ci" autocomplete="off" placeholder="Tell ${M[S.takes.A.model]} what to change, or press P and point">${btn("Send","primary","data-send")}</div>`:"")
 +(S.nt?newTask():"")+(S.toast?`<div class="toast">${S.toast.msg}${S.toast.undo?`<button class="link" data-tundo>Undo</button>`:""}</div>`:"")}
function draw(){const m=document.querySelector(".main"),y=m?m.scrollTop:0,ae=document.activeElement,aid=ae&&ae.id,sel=ae&&ae.selectionStart,cv=document.getElementById("ci")?.value||"";
 document.getElementById("app").innerHTML=view();document.querySelector(".main").scrollTop=y;const ci=document.getElementById("ci");if(ci)ci.value=cv;
 const f=document.getElementById("pinin")||(aid&&document.getElementById(aid));if(f){f.focus();if(f.id!=="pinin"&&sel!=null&&f.setSelectionRange)f.setSelectionRange(sel,sel)}}
function flash(msg,undo){clearTimeout(S.tt);S.toast={msg,undo};S.tt=setTimeout(()=>{S.toast=null;draw()},4000);draw()}
setInterval(()=>{let ch=0;for(const k of keys()){const v=S.takes[k];if(!ready(k)&&(S.tick++%2===0||v.style==="blend")){v.done++;ch=1;v.log.push(ready(k)?`Done, sent to ${M[other(v.model)]} for review`:`Step ${v.done} of ${v.of} done`)}}if(ch)draw()},1600);
function buildDir(n){const d=S.dirs.find(x=>x.n===n),k=["A","B","C"].find(x=>!S.takes[x]);if(!k){flash("Three takes is the limit here.");return}
 const m=d.by==="local"?"claude":d.by;S.takes[k]={model:m,style:n===5?"blend":"blend",done:0,of:4,t:{title:"No projects yet",cta:"Create your first project"},log:[`Building ${d.name}`]};d.take=k;S.stage="Build";flash(`${M[m]} is building ${d.name} as take ${k}.`,()=>{delete S.takes[k];d.take=null})}
document.addEventListener("click",e=>{const part=e.target.closest("[data-part]");if(part){const k=part.dataset.dir+":"+part.dataset.part;S.keep[k]?delete S.keep[k]:S.keep[k]=1;draw();return}
 const el=e.target.closest("[data-el]");if(S.point&&el&&!e.target.closest(".pin")){const fr=el.closest("[data-frame]").getBoundingClientRect(),r=el.getBoundingClientRect();S.pins=S.pins.filter(p=>p.state!=="open");S.pins.push({take:el.dataset.take,el:el.dataset.el,x:Math.max(8,Math.min(r.left-fr.left,fr.width-300)),y:r.bottom-fr.top+6,state:"open"});draw();return}
 const b=e.target.closest("button");if(!b){if(S.menu){S.menu=null;draw()}return}const d=b.dataset;
 if(d.stage){S.stage=d.stage;S.menu=null;S.cmp=null;draw()}
 else if(d.menu){S.menu=S.menu===d.menu?null:d.menu;draw()}
 else if(d.swap){const [k,m]=d.swap.split(":"),prev=S.takes[k].model;S.menu=null;if(m===prev){draw();return}S.takes[k].model=m;flash(`${M[m]} now writes take ${k}, from the same plan.`,()=>{S.takes[k].model=prev})}
 else if(d.cmp){S.cmp=S.cmp===d.cmp?null:d.cmp;draw()}
 else if(d.point!==undefined){S.point=!S.point;draw()}
 else if(d.log){S.log=S.log===d.log?null:d.log;draw()}
 else if(d.addtake!==undefined){S.stage="Explore";flash("Pick a sketch to build as the next take.")}
 else if(d.unpin){const p=S.pins[+d.unpin];S.takes[p.take].t[p.el]=p.prev;S.pins.splice(+d.unpin,1);draw()}
 else if(d.ans){const a=ASK.find(x=>x[0]===d.ans);S.ans[d.ans]=(S.ans[d.ans]+1)%a[2].length;S.stale=true;draw()}
 else if(d.redraft!==undefined){S.stale=false;S.redrafting=true;draw();setTimeout(()=>{S.redrafting=false;flash("Sketches redrafted to match.")},1400)}
 else if(d.drop){const x=S.dirs.find(z=>z.n===+d.drop);x.drop=!x.drop;draw()}
 else if(d.blend!==undefined){S.dirs.push({n:5,name:"Welcome + checklist",by:"claude",parts:["illus","title","list","cta"]});S.keep["5:list"]=1;flash("Claude Code sketched a blend of your keepers.",()=>{S.dirs.pop()})}
 else if(d.build){buildDir(+d.build)}
 else if(d.fix){flash(`Sent to ${M[S.takes[d.fix].model]} with the failing check attached.`)}
 else if(d.issue!==undefined){S.issue=+d.issue;draw()}
 else if(d.showall!==undefined){S.showAll=!S.showAll;draw()}
 else if(d.pick){S.picked=d.pick;S.stage="Ship";flash(`Kept take ${d.pick}.`,()=>{S.picked=null;S.stage="Review"})}
 else if(d.unpick!==undefined){S.picked=null;draw()}
 else if(d.combine!==undefined){S.dirs.push({n:5,name:"Welcome + checklist",by:"claude",parts:["illus","title","list","cta"]});buildDir(5)}
 else if(d.pr!==undefined){flash("Pull request #42 opened.")}
 else if(d.send!==undefined){const i=document.getElementById("ci");if(i.value.trim()){S.takes.A.log.push(`You: “${esc(i.value.trim())}”`);i.value="";flash(`Sent to ${M[S.takes.A.model]}.`)}}
 else if(d.nt!==undefined){S.nt=true;draw();document.getElementById("nt").focus()}
 else if(d.ntclose!==undefined||d.ntstart!==undefined){S.nt=false;if(d.ntstart!==undefined)flash("This sketch continues with the Projects task.");else draw()}
 else if(d.ntadd){S.ntText=(S.ntText.trim()+" "+d.ntadd).trim();draw()}
 else if(d.ntref!==undefined){S.ntRef=true;draw()}
 else if(d.tundo!==undefined){const u=S.toast?.undo;S.toast=null;u&&u();draw()}
 else if(d.other!==undefined){flash("This sketch walks through one task.")}});
document.addEventListener("input",e=>{if(e.target.id==="nt"){S.ntText=e.target.value;draw()}else if(e.target.dataset.slide!==undefined){S.slide=+e.target.value;const vp=e.target.parentElement;vp.querySelector(".over").style.clipPath=`inset(0 ${100-S.slide}% 0 0)`;vp.querySelector(".divider").style.left=S.slide+"%"}});
function submitPin(text){const p=S.pins.find(p=>p.state==="open");if(!p||!text.trim())return;p.state="work";const v=S.takes[p.take];v.log.push(`You pointed at the ${PART[p.el]||p.el}`);draw();
 setTimeout(()=>{const q=text.match(/[“"']([^”"']+)[”"']/);p.prev=v.t[p.el];if(q){v.t[p.el]=q[1];p.result=`Now says “${q[1]}”`}else p.result="Updated";p.state="done";v.log.push(`Changed the ${PART[p.el]||p.el}`);draw();document.querySelector(`[data-take="${p.take}"][data-el="${p.el}"]`)?.classList.add("flash")},2000)}
document.addEventListener("keydown",e=>{if(e.target.id==="pinin"){if(e.key==="Enter")submitPin(e.target.value);if(e.key==="Escape"){S.pins=S.pins.filter(p=>p.state!=="open");draw()}return}
 if(e.target.id==="ci"&&e.key==="Enter"){document.querySelector("[data-send]").click();return}
 if(/^(INPUT|TEXTAREA)$/.test(e.target.tagName))return;
 
 if(e.key==="Escape"){S.menu=null;S.point=false;S.cmp=null;draw()}});
draw();
