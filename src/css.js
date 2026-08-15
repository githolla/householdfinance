/* ==================================================================
   The whole stylesheet, as one template literal injected by <Frame>.

   Plain CSS on purpose — no Tailwind, no component library.
   Type: Fraunces (headings and numbers-as-statements), Karla (UI),
   IBM Plex Mono (all figures, tabular).

   Breakpoint ladder, desktop-first:
     980  three/four-up grids collapse to two
     899  touch layout — sidebar off, tab bar and quick-add on,
          16px inputs, 44px targets
     599  phone — single column, tighter padding
   Every new colour is --ink at an alpha. Pine, iris, brass and rust
   keep their existing meanings and appear only where they already did.
   ================================================================== */

export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Karla:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

.tc{--paper:#E6E8E1;--surface:#FBFBF8;--ink:#16211F;--soft:#5C6864;--line:#D2D6CC;
 --a:#2E6F63;--b:#6B5CA5;--joint:#B9862B;--warn:#A93E2F;--r:10px;
 --scrim:rgba(22,33,31,.44);--tab-h:56px;--fab-d:56px;--tap:44px;--r-sheet:18px;
 --safe-b:env(safe-area-inset-bottom,0px);--safe-t:env(safe-area-inset-top,0px);
 --lift:0 -6px 22px rgba(22,33,31,.07);--pop:0 5px 16px rgba(22,33,31,.20);
 background:var(--paper);color:var(--ink);font-family:'Karla',ui-sans-serif,system-ui,sans-serif;
 min-height:100%;box-sizing:border-box;-webkit-font-smoothing:antialiased;font-size:14px;
 overscroll-behavior-y:none;-webkit-tap-highlight-color:transparent;}
.tc *,.tc *::before,.tc *::after{box-sizing:border-box;}
.tc .num{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;}
.tc h1,.tc h2,.tc h3,.tc .serif{font-family:'Fraunces','Iowan Old Style',Georgia,serif;font-weight:400;margin:0;}
.tc button{font-family:inherit;cursor:pointer;}
.tc :focus-visible{outline:2px solid var(--a);outline-offset:2px;border-radius:4px;}
.tc .lockscroll{overflow:hidden;}

/* shell */
.tc .shell{display:grid;grid-template-columns:206px minmax(0,1fr);min-height:100vh;min-height:100dvh;}
.tc .side{border-right:1px solid var(--line);padding:22px 16px;position:sticky;top:0;height:100vh;
 display:flex;flex-direction:column;gap:22px;}
.tc .mark{line-height:1.15;}
.tc .mark .nm{font-family:'Fraunces',Georgia,serif;font-size:19px;letter-spacing:-.01em;display:block;}
.tc .mark .who{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--soft);}
/* Scoped to .side on purpose — .tabbar is also a nav element, and an
   unscoped nav-button rule paints the active tab as a filled black block. */
.tc .side nav{display:flex;flex-direction:column;gap:1px;}
.tc .side nav button{text-align:left;background:none;border:none;padding:7px 9px;border-radius:7px;
 font-size:13.5px;color:var(--soft);letter-spacing:.01em;}
.tc .side nav button.on{background:var(--ink);color:var(--paper);}
.tc .sidefoot{margin-top:auto;font-size:11.5px;color:var(--soft);line-height:1.5;}
.tc .main{padding:22px 26px 70px;min-width:0;}

/* page head */
.tc .phead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;
 border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:22px;}
.tc .phead h1{font-size:24px;letter-spacing:-.015em;}
.tc .phead .sub{font-size:12.5px;color:var(--soft);margin-top:3px;}
.tc .monthnav{display:flex;align-items:center;gap:5px;}
.tc .monthnav .m{font-size:13px;min-width:120px;text-align:center;}
.tc .arrow{background:none;border:1px solid var(--line);border-radius:50%;width:25px;height:25px;
 color:var(--soft);font-size:13px;display:grid;place-items:center;line-height:1;}

/* thesis */
.tc .thesis{font-family:'Fraunces',Georgia,serif;font-size:clamp(21px,2.7vw,31px);line-height:1.26;
 letter-spacing:-.015em;max-width:820px;margin:0 0 26px;}
.tc .thesis span{color:var(--soft);}

/* grid + cards */
.tc .grid{display:grid;gap:16px;}
.tc .g2{grid-template-columns:repeat(2,minmax(0,1fr));}
.tc .g3{grid-template-columns:repeat(3,minmax(0,1fr));}
.tc .g4{grid-template-columns:repeat(4,minmax(0,1fr));}
.tc .g23{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);}
@media(max-width:980px){.tc .g23,.tc .g3,.tc .g4{grid-template-columns:repeat(2,minmax(0,1fr));}}
.tc .card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:16px 17px;}
.tc .card h3{font-size:15.5px;}
.tc .chead{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:13px;}
.tc .chead .meta{font-size:11.5px;color:var(--soft);}
.tc .chartbox{height:210px;}
.tc .chartbox.tall{height:230px;}
.tc .chartbox.short{height:185px;}
.tc .chartbox.mini{height:120px;}

/* kpi */
.tc .kpi{padding:14px 15px;}
.tc .kpi .lab{font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--soft);}
.tc .kpi .val{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;
 font-size:23px;letter-spacing:-.02em;margin-top:7px;line-height:1.1;word-break:break-word;}
.tc .kpi .foot{font-size:11.5px;color:var(--soft);margin-top:7px;line-height:1.4;}
.tc .up{color:var(--a);}.tc .down{color:var(--warn);}.tc .mid{color:var(--joint);}

/* rail */
.tc .rail{display:flex;height:30px;width:100%;gap:2px;}
.tc .seg{min-width:2px;border-radius:3px;}
.tc .seg.gap{background:repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(92,104,100,.2) 5px,rgba(92,104,100,.2) 6px);
 border:1px dashed var(--soft);}
.tc .railkey{display:flex;flex-wrap:wrap;gap:13px;margin-top:10px;font-size:11.5px;color:var(--soft);}
.tc .railkey span{display:flex;align-items:center;gap:6px;}
.tc .dot{width:8px;height:8px;border-radius:2px;display:inline-block;flex:none;}

/* rows */
.tc .row{display:grid;grid-template-columns:1fr 92px 92px;gap:10px;align-items:center;padding:8px 0;
 border-bottom:1px solid rgba(210,214,204,.62);}
.tc .row:last-child{border-bottom:none;}
.tc .row.wide{grid-template-columns:1fr 130px 92px 96px;}
/* bills carry two actions — Pay and Mark paid — and wrap without the extra room */
.tc .row.wide.bill{grid-template-columns:1fr 110px 84px 156px;}
@media(max-width:700px){.tc .row.wide,.tc .row.wide.bill{grid-template-columns:1fr 96px;}
 .tc .hideS{display:none;}}
.tc .rowname{display:flex;align-items:center;gap:8px;min-width:0;}
.tc .rowname input{border:none;background:none;font-size:14px;color:var(--ink);padding:2px 0;
 width:100%;min-width:0;font-family:inherit;}
.tc .amt{text-align:right;font-size:13.5px;}
.tc .amt input{width:100%;text-align:right;border:none;background:none;font-size:13.5px;color:var(--ink);
 font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;padding:3px 0;}
.tc .amt input:focus{border-bottom:1px solid var(--line);outline:none;}
.tc .muted{color:var(--soft);}
.tc .warnText{color:var(--warn);}
.tc .over{color:var(--warn);font-weight:500;}
.tc .bar{grid-column:1/-1;height:4px;background:rgba(92,104,100,.13);border-radius:3px;overflow:hidden;}
.tc .bar i{display:block;height:100%;border-radius:3px;}
.tc .kill{background:none;border:none;color:var(--line);font-size:15px;padding:0 2px;line-height:1;}
.tc .tag{border:1px solid var(--line);background:var(--surface);border-radius:20px;font-size:10px;
 letter-spacing:.09em;text-transform:uppercase;padding:2px 8px;color:var(--soft);white-space:nowrap;
 font-family:inherit;max-width:120px;}
.tc .grouphead{font-size:10.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--soft);
 padding:16px 0 4px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;}

/* controls */
.tc .field{border:1px solid var(--line);background:var(--surface);border-radius:var(--r);padding:8px 10px;
 font-size:13.5px;color:var(--ink);font-family:inherit;width:100%;}
.tc .field:focus{border-color:var(--a);outline:none;}
.tc .btn{border:1px solid var(--ink);background:var(--ink);color:var(--paper);border-radius:var(--r);
 padding:8px 14px;font-size:13px;display:inline-flex;align-items:center;justify-content:center;gap:6px;}
.tc .btn[disabled]{opacity:.42;cursor:default;}
.tc .btn.ghost{background:none;color:var(--ink);border-color:var(--line);}
.tc .btn.tiny{padding:5px 10px;font-size:12px;}
.tc .btn.wide{width:100%;}
.tc .btn:active{transform:translateY(1px);}
.tc .toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px;}
.tc .toolbar .field{width:auto;min-width:120px;}
.tc .logger{display:flex;gap:8px;flex-wrap:wrap;background:var(--surface);
 border:1px solid var(--line);border-radius:var(--r);padding:10px;margin-bottom:16px;}
.tc .hiddenfile{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;}

/* goals */
.tc .track{height:7px;background:rgba(92,104,100,.14);border-radius:4px;margin:11px 0 9px;overflow:hidden;}
.tc .track i{display:block;height:100%;background:var(--joint);border-radius:4px;transition:width .4s ease;}
.tc .flag{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:20px;
 border:1px solid currentColor;white-space:nowrap;}
.tc .flag.ok{color:var(--a);}.tc .flag.late{color:var(--warn);}
.tc .metaline{display:flex;flex-wrap:wrap;gap:13px;font-size:12.5px;color:var(--soft);align-items:center;}
.tc .metaline b{color:var(--ink);font-weight:500;}
.tc .fourup{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:12px;padding-top:12px;
 border-top:1px solid var(--line);}
@media(max-width:640px){.tc .fourup{grid-template-columns:repeat(2,1fr);}}
.tc .lbl{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft);margin-bottom:4px;}

/* notes + chat */
.tc .note{display:flex;gap:9px;font-size:13px;line-height:1.45;padding:8px 0;
 border-bottom:1px solid rgba(210,214,204,.7);}
.tc .note:last-child{border-bottom:none;}
.tc .tick{width:4px;flex:none;border-radius:3px;margin:3px 0;}
.tc .chatlog{display:flex;flex-direction:column;gap:12px;overflow-y:auto;margin-bottom:12px;}
.tc .msg{font-size:13.5px;line-height:1.55;white-space:pre-wrap;}
.tc .msg.me{align-self:flex-end;background:var(--ink);color:var(--paper);padding:8px 12px;
 border-radius:12px 12px 3px 12px;max-width:86%;}
.tc .msg.them{border-left:2px solid var(--joint);padding-left:12px;}
.tc .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:11px;}
.tc .chip{border:1px solid var(--line);background:none;border-radius:20px;padding:5px 11px;font-size:12px;color:var(--soft);}
.tc .chip.on{background:var(--ink);color:var(--paper);border-color:var(--ink);}
.tc .askrow{display:flex;gap:7px;}
.tc .empty{font-size:13px;color:var(--soft);line-height:1.55;padding:8px 0;margin:0;}

/* tooltip */
.tc .tip{background:var(--ink);color:var(--paper);border-radius:7px;padding:7px 10px;font-size:12px;line-height:1.5;}
.tc .tip .k{opacity:.65;}

/* setup */
.tc .setup{max-width:560px;margin:0 auto;padding:6vh 18px 40px;}
.tc .setup h1{font-size:clamp(30px,5vw,44px);line-height:1.1;margin-bottom:12px;letter-spacing:-.02em;}
.tc .setup .sub{color:var(--soft);font-size:15px;line-height:1.55;margin-bottom:26px;}
.tc .pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:13px;}

/* ---- waterfall ---- */
.tc .stage{display:grid;grid-template-columns:1fr 96px 96px;gap:10px;align-items:center;
 padding:9px 0;border-bottom:1px solid rgba(210,214,204,.62);}
.tc .stage:last-child{border-bottom:none;}
.tc .stage .sbar{grid-column:1/-1;height:5px;background:rgba(92,104,100,.13);border-radius:3px;overflow:hidden;}
.tc .stage .sbar i{display:block;height:100%;border-radius:3px;background:var(--a);}
.tc .stage .sbar i.short{background:var(--warn);}
@media(max-width:599px){.tc .stage{grid-template-columns:1fr 92px;}.tc .stage .hideS{display:none;}}

/* ---- phone chrome: hidden until the touch band ---- */
.tc .tabbar,.tc .fab,.tc .phone-only{display:none;}

.tc .scrim{position:fixed;inset:0;z-index:50;background:var(--scrim);touch-action:none;}
.tc .sheet{position:fixed;inset:auto 0 0 0;z-index:51;display:flex;flex-direction:column;
 background:var(--surface);border-top:1px solid var(--line);
 border-radius:var(--r-sheet) var(--r-sheet) 0 0;box-shadow:var(--lift);
 max-height:min(88dvh,720px);padding-bottom:var(--safe-b);
 animation:sheetup .24s cubic-bezier(.32,.72,0,1);}
@keyframes sheetup{from{transform:translateY(101%);}to{transform:translateY(0);}}
.tc .sheethead{flex:none;display:flex;align-items:center;gap:10px;padding:10px 16px 6px;
 border-bottom:1px solid var(--line);position:relative;}
.tc .sheethead h3{font-size:16px;flex:1;}
.tc .grab{position:absolute;top:5px;left:50%;transform:translateX(-50%);width:34px;height:4px;
 border-radius:3px;background:var(--line);}
.tc .sheetbody{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;
 padding:14px 16px;min-height:0;}
.tc .sheetfoot{flex:none;padding:12px 16px;border-top:1px solid var(--line);}
@media(min-width:900px){
 .tc .sheet{inset:auto auto auto 50%;top:50%;transform:translate(-50%,-50%);width:440px;
  border-radius:var(--r-sheet);border:1px solid var(--line);animation:none;}
}

.tc .amtbig{width:100%;border:none;background:none;font-family:'IBM Plex Mono',monospace;
 font-variant-numeric:tabular-nums;font-size:40px;letter-spacing:-.03em;color:var(--ink);
 padding:2px 0;border-bottom:1px solid var(--line);}
.tc .amtbig:focus{outline:none;border-bottom-color:var(--a);}
.tc .shimmer{opacity:.5;}
.tc .chiprow{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;}
.tc .chiprow .chip{white-space:nowrap;flex:none;}
.tc .whorow{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}
.tc .whobtn{border:1px solid var(--line);background:none;border-radius:var(--r);padding:10px 6px;
 font-size:13px;color:var(--soft);}
.tc .whobtn.on{font-weight:500;}
.tc .readout{display:flex;align-items:center;gap:10px;margin-bottom:14px;font-size:12.5px;line-height:1.4;}
.tc .thumb{width:44px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--line);flex:none;}
.tc .morelist button{display:flex;justify-content:space-between;align-items:center;width:100%;
 background:none;border:none;border-bottom:1px solid rgba(210,214,204,.7);padding:14px 2px;
 font-size:15px;color:var(--ink);text-align:left;}
.tc .toast{position:fixed;left:16px;right:16px;z-index:60;display:flex;justify-content:space-between;
 align-items:center;gap:12px;background:var(--ink);color:var(--paper);border-radius:var(--r);
 padding:12px 14px;font-size:13.5px;box-shadow:var(--pop);
 bottom:calc(var(--tab-h) + var(--safe-b) + 78px);}
.tc .toast button{background:none;border:none;color:var(--paper);text-decoration:underline;font-size:13.5px;}
@media(min-width:900px){.tc .toast{left:auto;right:22px;bottom:22px;max-width:380px;}}

/* ---- dashboard flow ---- */
.tc .dashflow{display:grid;gap:14px;grid-template-columns:minmax(0,1fr);}
@media(min-width:900px){
 .tc .dashflow{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:16px;}
 .tc .dashflow>.wideblock{grid-column:1/-1;}
}
.tc .stateline{border-bottom:1px solid var(--line);padding-bottom:14px;}
.tc .stateline .fig{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;
 font-size:34px;letter-spacing:-.03em;line-height:1.05;margin:6px 0 8px;}
.tc .stateline .say{font-family:'Fraunces',Georgia,serif;font-size:19px;line-height:1.35;}
.tc .stateline .say span{color:var(--soft);}
.tc .pacewrap{padding:2px 0;}
.tc .pace{position:relative;height:9px;background:rgba(92,104,100,.13);border-radius:5px;overflow:hidden;}
.tc .pace i{display:block;height:100%;border-radius:5px;background:var(--a);}
.tc .pace i.over{background:var(--warn);}
.tc .pacemark{position:absolute;top:-3px;width:1px;height:15px;background:var(--soft);}
.tc .paceline{font-size:12.5px;color:var(--soft);margin-top:8px;}
.tc .envrow{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;
 background:none;border:none;border-bottom:1px solid rgba(210,214,204,.7);padding:11px 2px;
 font-size:14px;color:var(--ink);text-align:left;}
.tc .envrow:last-child{border-bottom:none;}
.tc .envrow .v{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:13.5px;color:var(--soft);}
.tc .envrow .v.over{color:var(--warn);}

/* ---- hover only where there's a pointer ---- */
@media(hover:hover){
 .tc .side nav button:hover{background:rgba(255,255,255,.55);color:var(--ink);}
 .tc .arrow:hover{border-color:var(--a);color:var(--a);}
 .tc .rowname input:hover{border-bottom:1px dotted var(--line);}
 .tc .amt input:hover{border-bottom:1px solid var(--line);}
 .tc .kill:hover{color:var(--warn);}
 .tc .btn:hover{background:#0d1614;}
 .tc .btn.ghost:hover{background:rgba(255,255,255,.6);border-color:var(--a);color:var(--a);}
 .tc .chip:hover{border-color:var(--a);color:var(--a);}
 .tc .envrow:hover,.tc .morelist button:hover{background:rgba(255,255,255,.5);}
}

/* ==================================================================
   touch band
   ================================================================== */
@media(max-width:899px){
 .tc .shell{grid-template-columns:minmax(0,1fr);}
 .tc .side{display:none;}
 .tc .main{padding:14px 14px calc(var(--tab-h) + var(--safe-b) + 28px);}
 .tc .thesis,.tc .logger,.tc .desk-only{display:none;}
 .tc .phone-only{display:block;}

 .tc .tabbar{display:grid;grid-template-columns:repeat(5,1fr);position:fixed;inset:auto 0 0 0;
  z-index:40;background:var(--surface);border-top:1px solid var(--line);
  box-shadow:var(--lift);padding-bottom:var(--safe-b);}
 .tc .tab{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
  height:var(--tab-h);background:none;border:none;padding:0;position:relative;
  color:var(--soft);font-size:10.5px;}
 .tc .tab.on{color:var(--ink);}
 .tc .tab.on::before{content:"";position:absolute;top:0;left:50%;transform:translateX(-50%);
  width:26px;height:2px;border-radius:0 0 2px 2px;background:var(--joint);}
 .tc .tab:active{background:rgba(22,33,31,.05);}
 .tc .tab svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.6;
  stroke-linecap:round;stroke-linejoin:round;}

 .tc .fab{display:grid;place-items:center;position:fixed;right:16px;z-index:41;
  bottom:calc(var(--tab-h) + var(--safe-b) + 14px);
  width:var(--fab-d);height:var(--fab-d);border-radius:50%;border:none;
  background:var(--ink);color:var(--paper);box-shadow:var(--pop);font-size:26px;line-height:1;}
 .tc .fab:active{transform:scale(.94);}

 /* 16px is the floor that stops iOS zooming on focus */
 .tc input,.tc select,.tc textarea{font-size:16px;}
 .tc .field{min-height:var(--tap);padding:11px 12px;}
 .tc .amt input,.tc .rowname input{font-size:16px;padding:6px 0;}
 .tc select.tag{font-size:16px;padding:5px 8px;max-width:none;}
 .tc .btn{min-height:var(--tap);padding:10px 16px;font-size:15px;}
 .tc .btn.tiny{min-height:40px;padding:8px 12px;font-size:13.5px;}
 .tc .chip{min-height:40px;padding:9px 14px;font-size:13.5px;}
 .tc .arrow{width:40px;height:40px;font-size:17px;}
 /* expands the × to a 44px target without moving a pixel of layout */
 .tc .kill{padding:11px;margin:-11px;font-size:17px;}
 .tc .row{padding:11px 0;}
 .tc .kpi .val{font-size:20px;white-space:nowrap;overflow-wrap:normal;}
 .tc .phead{flex-direction:column;align-items:stretch;gap:10px;padding-bottom:10px;margin-bottom:14px;}
 .tc .phead h1{font-size:21px;}
 .tc .monthnav{justify-content:space-between;}
 .tc .monthnav .m{font-size:15px;min-width:0;}
 .tc .g23{grid-template-columns:minmax(0,1fr);}

 .tc .d-state{order:1;} .tc .d-pace{order:2;} .tc .d-envs{order:3;}
 .tc .d-due{order:4;}   .tc .d-notes{order:5;} .tc .d-recent{order:6;}
 .tc .d-goals{order:7;} .tc .d-kpis{order:8;}  .tc .d-rail{order:9;}
 .tc .d-cats{order:10;} .tc .d-flow{order:11;}
}

@media(max-width:599px){
 .tc .grid{grid-template-columns:minmax(0,1fr);gap:12px;}
 .tc .g4,.tc .g3{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
 .tc .g3>:last-child:nth-child(odd){grid-column:1/-1;}
 .tc .pair{grid-template-columns:minmax(0,1fr);}
 .tc .card{padding:13px 14px;}
 .tc .chartbox,.tc .chartbox.tall,.tc .chartbox.short{height:170px;}
}

@media(prefers-reduced-motion:reduce){.tc *{transition:none!important;animation:none!important;}}
`;
