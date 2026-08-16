/* ==================================================================
   The whole stylesheet, as one template literal injected by <Frame>.

   Plain CSS on purpose — no Tailwind, no component library.
   Look: warm bone page, white cards with soft shadows, pill buttons,
   mid-century avocado-green brand. Type: Plus Jakarta Sans (everything), IBM Plex Mono
   (all figures, tabular).

   Breakpoint ladder, desktop-first:
     980  three/four-up grids collapse to two
     899  touch layout — sidebar off, tab bar and quick-add on,
          16px inputs, 44px targets
     599  phone — single column, tighter padding
   ================================================================== */

export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');

.tc{--page:#F3F1E8;--surface:#FFFFFF;--surface2:#EFEDE1;--ink:#20261B;--soft:#6C7260;--line:#E0DECE;
 --brand:#4E7A3A;--brand-deep:#3E622E;--brand-soft:#E5ECD8;
 --a:#4E7A3A;--b:#1F7A8C;--joint:#D98E04;--warn:#D93A4C;--ok:#1E8A5A;--r:16px;
 --scrim:rgba(32,38,27,.44);--tab-h:60px;--fab-d:56px;--tap:44px;--r-sheet:22px;
 --safe-b:env(safe-area-inset-bottom,0px);--safe-t:env(safe-area-inset-top,0px);
 --shadow:0 4px 18px rgba(46,58,36,.06);--pop:0 10px 28px rgba(46,58,36,.20);
 --lift:0 -6px 22px rgba(46,58,36,.09);
 background:var(--page);color:var(--ink);
 font-family:'Plus Jakarta Sans',ui-sans-serif,system-ui,sans-serif;
 min-height:100%;box-sizing:border-box;-webkit-font-smoothing:antialiased;font-size:14px;
 overscroll-behavior-y:none;-webkit-tap-highlight-color:transparent;}
.tc *,.tc *::before,.tc *::after{box-sizing:border-box;}
.tc .num{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;}
.tc h1,.tc h2,.tc h3,.tc .serif{font-family:inherit;font-weight:700;letter-spacing:-.015em;margin:0;}
.tc button{font-family:inherit;cursor:pointer;}
.tc :focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:6px;}
.tc .lockscroll{overflow:hidden;}

/* shell — the sidebar sits on the page surface, not in a white column;
   the content column caps its width so huge monitors don't stretch it */
.tc .shell{display:grid;grid-template-columns:236px minmax(0,1fr);min-height:100vh;min-height:100dvh;
 max-width:1520px;margin:0 auto;}
.tc .side{background:transparent;border-right:none;padding:26px 18px 22px 22px;
 position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:24px;}
.tc .mark{line-height:1.2;display:flex;align-items:center;gap:10px;}
.tc .mark .logo{width:34px;height:34px;border-radius:11px;background:var(--brand);color:#fff;
 display:grid;place-items:center;font-weight:800;font-size:16px;flex:none;}
.tc .mark .nm{font-weight:800;font-size:15.5px;letter-spacing:-.01em;display:block;}
.tc .mark .who{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);font-weight:600;}
.tc .side nav{display:flex;flex-direction:column;gap:3px;}
.tc .navsec{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft);
 font-weight:700;padding:12px 12px 4px;}
.tc .navsec:first-child{padding-top:0;}
.tc .side nav button{display:flex;align-items:center;gap:11px;text-align:left;background:none;border:none;
 padding:10px 12px;border-radius:12px;font-size:13.5px;font-weight:600;color:var(--soft);}
.tc .side nav button svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.7;
 stroke-linecap:round;stroke-linejoin:round;flex:none;}
.tc .side nav button.on{background:var(--brand);color:#fff;box-shadow:var(--shadow);}
.tc .sidefoot{margin-top:auto;font-size:11.5px;color:var(--soft);line-height:1.5;
 background:var(--surface);border-radius:16px;padding:13px;box-shadow:var(--shadow);}
.tc .main{padding:30px 36px 92px;min-width:0;max-width:1180px;}

/* page head */
.tc .phead{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;
 padding-bottom:14px;margin-bottom:20px;}
.tc .phead h1{font-size:27px;font-weight:800;letter-spacing:-.02em;}
.tc .phead .sub{font-size:13.5px;color:var(--soft);margin-top:4px;font-weight:500;line-height:1.5;}
.tc .monthnav{display:flex;align-items:center;gap:6px;background:var(--surface);border-radius:999px;
 padding:4px 6px;box-shadow:var(--shadow);}
.tc .monthnav .m{font-size:13px;min-width:118px;text-align:center;font-weight:600;}
.tc .arrow{background:var(--surface2);border:none;border-radius:50%;width:28px;height:28px;
 color:var(--soft);font-size:14px;display:grid;place-items:center;line-height:1;}

/* thesis */
.tc .thesis{font-size:clamp(19px,2.3vw,26px);line-height:1.3;font-weight:700;letter-spacing:-.02em;
 max-width:860px;margin:0 0 22px;}
.tc .thesis span{color:var(--soft);font-weight:500;}

/* grid + cards */
.tc .grid{display:grid;gap:14px;}
.tc .g2{grid-template-columns:repeat(2,minmax(0,1fr));}
.tc .g3{grid-template-columns:repeat(3,minmax(0,1fr));}
.tc .g4{grid-template-columns:repeat(4,minmax(0,1fr));}
.tc .g23{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);}
@media(max-width:980px){.tc .g23,.tc .g3,.tc .g4{grid-template-columns:repeat(2,minmax(0,1fr));}}
.tc .card{background:var(--surface);border:1px solid rgba(224,222,206,.6);border-radius:20px;
 padding:19px 21px;box-shadow:var(--shadow);}
.tc .card h3{font-size:15px;font-weight:700;letter-spacing:-.01em;}
.tc .chead{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:13px;}
.tc .chead .meta{font-size:11.5px;color:var(--soft);font-weight:500;}
.tc .chartbox{height:210px;}
.tc .chartbox.tall{height:230px;}
.tc .chartbox.short{height:185px;}
.tc .chartbox.mini{height:120px;}

/* kpi */
.tc .kpi{padding:15px 16px;}
.tc .kpi .lab{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);font-weight:700;}
.tc .kpi .val{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;
 font-size:22px;letter-spacing:-.02em;margin-top:7px;line-height:1.1;word-break:break-word;font-weight:500;}
.tc .kpi .foot{font-size:11.5px;color:var(--soft);margin-top:7px;line-height:1.4;font-weight:500;}
.tc .up{color:var(--ok);}.tc .down{color:var(--warn);}.tc .mid{color:var(--joint);}

/* rings + status chips */
.tc .ringbox{position:relative;flex:none;}
.tc .ringbox svg{display:block;}
.tc .ringlabel{position:absolute;inset:0;display:grid;place-items:center;text-align:center;line-height:1.15;}
.tc .schip{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;
 padding:3px 10px;border-radius:999px;white-space:nowrap;}
.tc .schip.ok{background:#E1F1E6;color:#186B44;}
.tc .schip.warn{background:#F8EED7;color:#8A5A06;}
.tc .schip.over{background:#FBE7EA;color:#B3243B;}
.tc .schip.done{background:var(--surface2);color:var(--soft);}
.tc .trend{font-size:11.5px;font-weight:700;white-space:nowrap;}
.tc .trend.up{color:var(--warn);}
.tc .trend.down{color:var(--ok);}

/* the one thing to do next — the hero of the one-page plan */
.tc .nextcard{background:linear-gradient(135deg,#3E622E 0%,#587F42 100%);color:#fff;box-shadow:var(--pop);border:none;}
.tc .nextcard .nlab{font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;font-weight:700;opacity:.75;}
.tc .nextcard .ntitle{font-size:18px;font-weight:800;letter-spacing:-.015em;margin:7px 0 6px;line-height:1.25;}
.tc .nextcard .nwhy{font-size:12.5px;font-weight:500;opacity:.88;line-height:1.5;margin-bottom:13px;}
.tc .nextcard .btn{background:#fff;color:var(--brand);box-shadow:none;}
.tc .nextcard .nstep{font-size:11px;font-weight:700;opacity:.75;}

/* the money-steps ladder */
.tc .step{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--surface2);}
.tc .step:last-child{border-bottom:none;}
.tc .stepdot{width:28px;height:28px;border-radius:50%;flex:none;display:grid;place-items:center;
 font-size:12.5px;font-weight:700;background:var(--surface2);color:var(--soft);}
.tc .step.done .stepdot{background:#E1F1E6;color:#186B44;}
.tc .step.current .stepdot{background:var(--brand);color:#fff;}
.tc .steplabel{display:block;font-weight:700;font-size:13.5px;}
.tc .step.later .steplabel{color:var(--soft);font-weight:600;}
.tc .stepdetail{display:block;font-size:12px;color:var(--soft);margin-top:2px;font-weight:500;line-height:1.45;}

/* getting-started checklist — the whole row is the tap target */
.tc .check{display:flex;align-items:center;gap:11px;padding:9px 2px;border:none;
 border-bottom:1px solid var(--surface2);font-weight:600;font-size:13.5px;
 width:100%;text-align:left;background:none;color:var(--ink);font-family:inherit;border-radius:0;}
.tc .check:last-child{border-bottom:none;}
.tc .check .box{width:22px;height:22px;border-radius:8px;flex:none;display:grid;place-items:center;
 font-size:12px;font-weight:800;border:2px solid var(--line);color:transparent;}
.tc .check.done .box{background:#E1F1E6;border-color:#E1F1E6;color:#186B44;}
.tc .check.done .t{color:var(--soft);}
.tc .check .go{margin-left:auto;}

/* envelope card grid (Budget) */
.tc .cardgrid{display:grid;gap:14px;grid-template-columns:repeat(3,minmax(0,1fr));}
@media(max-width:1279px){.tc .cardgrid{grid-template-columns:repeat(2,minmax(0,1fr));}}
@media(max-width:599px){.tc .cardgrid{grid-template-columns:minmax(0,1fr);}}
.tc .envcard .toprow{display:flex;align-items:center;gap:6px;}
.tc .envcard .toprow input{border:none;background:none;font-size:14.5px;font-weight:700;color:var(--ink);
 padding:2px 0;width:100%;min-width:0;font-family:inherit;letter-spacing:-.01em;}
.tc .envcard .midrow{display:flex;align-items:center;gap:16px;margin:12px 0 10px;}
.tc .envcard .leftlab{font-size:11px;color:var(--soft);font-weight:600;}
.tc .envcard .leftfig{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;
 font-size:21px;letter-spacing:-.02em;}
.tc .envcard .leftfig .of{color:var(--soft);font-size:13px;}
.tc .envcard .of input{width:74px;border:none;background:var(--surface2);border-radius:8px;color:var(--soft);
 font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:12.5px;padding:3px 7px;}
.tc .envcard .foot{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}

/* rail */
.tc .rail{display:flex;height:30px;width:100%;gap:2px;}
.tc .seg{min-width:2px;border-radius:4px;}
.tc .seg.gap{background:repeating-linear-gradient(45deg,transparent,transparent 5px,rgba(108,114,96,.18) 5px,rgba(108,114,96,.18) 6px);
 border:1px dashed var(--soft);}
.tc .railkey{display:flex;flex-wrap:wrap;gap:13px;margin-top:10px;font-size:11.5px;color:var(--soft);font-weight:500;}
.tc .railkey span{display:flex;align-items:center;gap:6px;}
.tc .dot{width:8px;height:8px;border-radius:3px;display:inline-block;flex:none;}

/* rows */
.tc .row{display:grid;grid-template-columns:1fr 92px 92px;gap:10px;align-items:center;padding:9px 0;
 border-bottom:1px solid var(--surface2);}
.tc .row:last-child{border-bottom:none;}
.tc .row.wide{grid-template-columns:1fr 130px 92px 96px;}
.tc .row.wide.bill{grid-template-columns:1fr 110px 84px 168px;}
@media(max-width:700px){.tc .row.wide{grid-template-columns:1fr 96px;}
 .tc .hideS{display:none;}
 /* the bill row stacks: name gets a whole line, amount + actions share
    the next one — so every Paid button is visibly anchored to its bill */
 .tc .row.wide.bill{grid-template-columns:minmax(0,1fr) auto;row-gap:6px;}
 .tc .row.wide.bill .rowname{grid-column:1/-1;flex-wrap:wrap;}
 .tc .row.wide.bill .amt{text-align:left;align-self:center;}
 .tc .row.wide.bill .amt:last-child{text-align:right;}}
.tc .rowname{display:flex;align-items:center;gap:8px;min-width:0;}
.tc .rowname input{border:none;background:none;font-size:14px;font-weight:600;color:var(--ink);padding:2px 0;
 width:100%;min-width:0;font-family:inherit;}
.tc .amt{text-align:right;font-size:13.5px;}
.tc .amt input{width:100%;text-align:right;border:none;background:none;font-size:13.5px;color:var(--ink);
 font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;padding:3px 0;}
.tc .amt input:focus{border-bottom:1px solid var(--brand);outline:none;}
.tc .muted{color:var(--soft);}
.tc .warnText{color:var(--warn);}
.tc .over{color:var(--warn);font-weight:600;}
.tc .bar{grid-column:1/-1;height:5px;background:var(--surface2);border-radius:4px;overflow:hidden;}
.tc .bar i{display:block;height:100%;border-radius:4px;}
.tc .kill{background:none;border:none;color:#C6C4B2;font-size:15px;padding:0 2px;line-height:1;}
.tc .tag{border:none;background:var(--surface2);border-radius:999px;font-size:10px;font-weight:700;
 letter-spacing:.07em;text-transform:uppercase;padding:4px 10px;color:var(--soft);white-space:nowrap;
 font-family:inherit;max-width:130px;}
.tc .grouphead{font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft);font-weight:700;
 padding:16px 0 5px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;}

/* controls */
.tc .field{border:1.5px solid var(--line);background:var(--surface);border-radius:12px;padding:9px 12px;
 font-size:13.5px;color:var(--ink);font-family:inherit;font-weight:500;width:100%;}
.tc .field:focus{border-color:var(--brand);outline:none;box-shadow:0 0 0 3px var(--brand-soft);}
.tc .btn{border:none;background:var(--brand);color:#fff;border-radius:999px;
 padding:10px 18px;font-size:13px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:7px;
 box-shadow:var(--shadow);}
.tc .btn[disabled]{opacity:.45;cursor:default;}
.tc .btn.ghost{background:var(--surface);color:var(--ink);border:1.5px solid var(--line);box-shadow:none;}
.tc .btn.tiny{padding:6px 12px;font-size:12px;}
.tc .btn.wide{width:100%;}
.tc .btn{transition:background .12s ease,transform .08s ease;}
.tc .btn:active{transform:translateY(1px) scale(.99);}
.tc .chip{transition:background .12s ease,color .12s ease;}
.tc .track i,.tc .pace i,.tc .bar i{transition:width .35s ease;}
.tc .toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px;}
.tc .toolbar .field{width:auto;min-width:120px;}
.tc .logger{display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:var(--surface);
 border:none;border-radius:16px;padding:12px;margin-bottom:16px;box-shadow:var(--shadow);}
.tc .hiddenfile{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;}

/* goals */
.tc .track{height:8px;background:var(--surface2);border-radius:5px;margin:11px 0 9px;overflow:hidden;}
.tc .track i{display:block;height:100%;background:var(--joint);border-radius:5px;transition:width .4s ease;}
.tc .flag{font-size:10.5px;letter-spacing:.05em;text-transform:uppercase;font-weight:700;padding:3px 9px;
 border-radius:999px;white-space:nowrap;}
.tc .flag.ok{color:#186B44;background:#E1F1E6;}.tc .flag.late{color:#B3243B;background:#FBE7EA;}
.tc .metaline{display:flex;flex-wrap:wrap;gap:13px;font-size:12.5px;color:var(--soft);align-items:center;font-weight:500;}
.tc .metaline b{color:var(--ink);font-weight:700;}
.tc .fourup{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-top:12px;padding-top:12px;
 border-top:1px solid var(--line);}
@media(max-width:640px){.tc .fourup{grid-template-columns:repeat(2,1fr);}}
.tc .lbl{display:block;font-size:10px;letter-spacing:.09em;text-transform:uppercase;color:var(--soft);
 font-weight:700;margin-bottom:5px;}

/* notes + chat */
.tc .note{display:flex;gap:9px;font-size:13px;line-height:1.45;padding:9px 0;font-weight:500;
 border-bottom:1px solid var(--surface2);}
.tc .note:last-child{border-bottom:none;}
.tc .tick{width:4px;flex:none;border-radius:3px;margin:3px 0;}
.tc .chatlog{display:flex;flex-direction:column;gap:12px;overflow-y:auto;margin-bottom:12px;}
.tc .msg{font-size:13.5px;line-height:1.55;white-space:pre-wrap;font-weight:500;}
.tc .msg.me{align-self:flex-end;background:var(--brand);color:#fff;padding:9px 13px;
 border-radius:14px 14px 4px 14px;max-width:86%;}
.tc .msg.them{background:var(--surface2);padding:9px 13px;border-radius:14px 14px 14px 4px;max-width:92%;}
.tc .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:11px;}
.tc .chip{border:none;background:var(--surface2);border-radius:999px;padding:7px 13px;font-size:12px;
 font-weight:600;color:var(--soft);}
.tc .chip.on{background:var(--brand);color:#fff;}
.tc .askrow{display:flex;gap:7px;}
.tc .empty{font-size:13px;color:var(--soft);line-height:1.55;padding:8px 0;margin:0;font-weight:500;}

/* tooltip */
.tc .tip{background:var(--ink);color:#fff;border-radius:10px;padding:8px 11px;font-size:12px;line-height:1.5;font-weight:500;}
.tc .tip .k{opacity:.65;}

/* setup */
.tc .setup{max-width:560px;margin:0 auto;padding:6vh 18px 40px;}
.tc .setup h1{font-size:clamp(28px,4.6vw,40px);line-height:1.12;margin-bottom:12px;font-weight:800;letter-spacing:-.025em;}
.tc .setup .sub{color:var(--soft);font-size:15px;line-height:1.55;margin-bottom:26px;font-weight:500;}
.tc .pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:13px;}

/* waterfall */
.tc .stage{display:grid;grid-template-columns:1fr 96px 96px;gap:10px;align-items:center;
 padding:10px 0;border-bottom:1px solid var(--surface2);}
.tc .stage:last-child{border-bottom:none;}
.tc .stage .sbar{grid-column:1/-1;height:6px;background:var(--surface2);border-radius:4px;overflow:hidden;}
.tc .stage .sbar i{display:block;height:100%;border-radius:4px;background:var(--brand);}
.tc .stage .sbar i.short{background:var(--warn);}
@media(max-width:599px){.tc .stage{grid-template-columns:1fr 92px;}.tc .stage .hideS{display:none;}}

/* ---- phone chrome: hidden until the touch band ---- */
.tc .tabbar,.tc .phone-only{display:none;}

/* the add-expense affordance is always on screen: a pill on desktop, a circle on phone */
.tc .fab{display:inline-flex;align-items:center;gap:8px;position:fixed;right:24px;bottom:24px;z-index:41;
 height:50px;padding:0 20px;border-radius:999px;border:none;background:var(--brand);color:#fff;
 box-shadow:var(--pop);font-size:14.5px;font-weight:700;}
.tc .fab .fabplus{font-size:20px;line-height:1;font-weight:600;}
.tc .fab:active{transform:scale(.96);}

.tc .scrim{position:fixed;inset:0;z-index:50;background:var(--scrim);touch-action:none;}
.tc .sheet{position:fixed;inset:auto 0 0 0;z-index:51;display:flex;flex-direction:column;
 background:var(--surface);border:none;
 border-radius:var(--r-sheet) var(--r-sheet) 0 0;box-shadow:var(--lift);
 max-height:min(88dvh,760px);padding-bottom:var(--safe-b);
 animation:sheetup .24s cubic-bezier(.32,.72,0,1);}
@keyframes sheetup{from{transform:translateY(101%);}to{transform:translateY(0);}}
.tc .sheethead{flex:none;display:flex;align-items:center;gap:10px;padding:12px 18px 8px;
 border-bottom:1px solid var(--line);position:relative;}
.tc .sheethead h3{font-size:16px;flex:1;font-weight:700;}
.tc .grab{position:absolute;top:6px;left:50%;transform:translateX(-50%);width:36px;height:4px;
 border-radius:3px;background:var(--line);}
.tc .sheetbody{overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;
 padding:14px 18px;min-height:0;}
.tc .sheetfoot{flex:none;padding:12px 18px;border-top:1px solid var(--line);}
@media(min-width:900px){
 .tc .sheet{inset:auto auto auto 50%;top:50%;transform:translate(-50%,-50%);width:460px;
  border-radius:var(--r-sheet);box-shadow:var(--pop);animation:none;}
}

/* quick add */
.tc .amtbig{width:100%;border:none;background:none;font-family:'IBM Plex Mono',monospace;
 font-variant-numeric:tabular-nums;font-size:40px;letter-spacing:-.03em;color:var(--ink);
 padding:2px 0;border-bottom:2px solid var(--line);}
.tc .amtbig:focus{outline:none;border-bottom-color:var(--brand);}
.tc .amtdisplay{display:none;font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;
 font-size:42px;letter-spacing:-.03em;text-align:center;padding:6px 0 2px;}
.tc .amtdisplay .ph{color:var(--soft);opacity:.5;}
.tc .padgrid{display:none;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px;}
.tc .padkey{height:56px;border:none;border-radius:14px;background:var(--surface2);
 font-size:21px;font-weight:600;color:var(--ink);font-family:inherit;}
.tc .padkey:active{background:var(--brand-soft);}
@media(max-height:700px){.tc .padkey{height:48px;}}
.tc .shimmer{opacity:.5;}
.tc .chiprow{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch;}
.tc .chiprow .chip{white-space:nowrap;flex:none;}
.tc .whorow{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;}
.tc .whobtn{border:1.5px solid var(--line);background:var(--surface);border-radius:12px;padding:10px 6px;
 font-size:13px;font-weight:600;color:var(--soft);}
.tc .whobtn.on{font-weight:700;background:var(--surface2);}
.tc .readout{display:flex;align-items:center;gap:10px;margin-bottom:14px;font-size:12.5px;line-height:1.4;font-weight:500;}
.tc .thumb{width:44px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--line);flex:none;}
.tc .morelist button{display:flex;justify-content:space-between;align-items:center;width:100%;
 background:none;border:none;border-bottom:1px solid var(--surface2);padding:14px 2px;
 font-size:15px;font-weight:600;color:var(--ink);text-align:left;}
.tc .toast{position:fixed;left:16px;right:16px;z-index:60;display:flex;justify-content:space-between;
 align-items:center;gap:12px;background:var(--ink);color:#fff;border-radius:14px;
 padding:13px 15px;font-size:13.5px;font-weight:600;box-shadow:var(--pop);
 bottom:calc(var(--tab-h) + var(--safe-b) + 78px);}
.tc .toast button{background:none;border:none;color:#fff;text-decoration:underline;font-size:13.5px;font-weight:700;}
@media(min-width:900px){.tc .toast{left:auto;right:24px;bottom:88px;max-width:380px;}}

/* dashboard flow */
.tc .dashflow{display:grid;gap:14px;grid-template-columns:minmax(0,1fr);}
/* On the phone the columns dissolve and the d-* order classes take over. */
.tc .colmain,.tc .colside{display:contents;}
@media(min-width:900px){
 .tc .dashflow{grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:16px;align-items:start;}
 .tc .dashflow>.wideblock{grid-column:1/-1;}
 .tc .colmain,.tc .colside{display:flex;flex-direction:column;gap:16px;min-width:0;}
}
.tc .stateline{padding:4px 0 14px;}
.tc .stateline .fig{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;
 font-size:36px;letter-spacing:-.03em;line-height:1.05;margin:6px 0 8px;}
.tc .stateline .say{font-size:17.5px;line-height:1.4;font-weight:700;letter-spacing:-.01em;}
.tc .stateline .say span{color:var(--soft);font-weight:500;}
.tc .pacewrap{padding:2px 0;}
.tc .pace{position:relative;height:10px;background:var(--surface2);border-radius:6px;overflow:hidden;}
.tc .pace i{display:block;height:100%;border-radius:6px;background:var(--brand);}
.tc .pace i.over{background:var(--warn);}
.tc .pacemark{position:absolute;top:-3px;width:2px;height:16px;border-radius:2px;background:var(--soft);}
.tc .paceline{font-size:12.5px;color:var(--soft);margin-top:9px;font-weight:500;}
.tc .envrow{display:flex;justify-content:space-between;align-items:center;gap:10px;width:100%;
 background:none;border:none;border-bottom:1px solid var(--surface2);padding:12px 2px;
 font-size:14px;font-weight:600;color:var(--ink);text-align:left;}
.tc .envrow:last-child{border-bottom:none;}
.tc .envrow .v{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:13.5px;color:var(--soft);}
.tc .envrow .v.over{color:var(--warn);}
.tc .rankicon{width:34px;height:34px;border-radius:11px;background:var(--surface2);display:grid;
 place-items:center;flex:none;font-size:14px;}

/* calendar */
.tc .calhead{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin-bottom:6px;
 font-size:10px;font-weight:700;color:var(--soft);text-transform:uppercase;letter-spacing:.06em;text-align:center;}
.tc .calgrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;}
.tc .calblank{border-radius:12px;background:var(--surface2);opacity:.4;min-height:76px;}
.tc .calcell{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:3px;
 min-height:76px;min-width:0;padding:7px 8px;border:1.5px solid var(--line);border-radius:12px;
 background:var(--surface);text-align:left;color:var(--ink);}
.tc .calcell.today{border-color:var(--brand);}
.tc .calcell.today .caldaynum{background:var(--brand);color:#fff;}
.tc .calcell.sel{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-soft);}
.tc .caldaynum{font-size:11.5px;font-weight:700;border-radius:999px;min-width:20px;height:20px;
 display:grid;place-items:center;padding:0 5px;margin-left:-3px;}
.tc .calspent{font-size:10.5px;color:var(--soft);max-width:100%;overflow:hidden;text-overflow:ellipsis;}
.tc .calmarks{display:flex;flex-wrap:wrap;gap:3px;align-items:center;margin-top:auto;}
.tc .calmarks i{width:7px;height:7px;border-radius:50%;background:var(--brand);}
.tc .calmarks i.paid{background:var(--ok);}
.tc .calmarks i.late{background:var(--warn);}
.tc .caltaxmark{font-style:normal;font-size:8.5px;font-weight:800;color:#96610A;background:#FCF1DC;
 border-radius:5px;padding:1px 4px;text-transform:uppercase;letter-spacing:.04em;}
.tc .calpop{display:none;position:absolute;z-index:30;top:calc(100% + 5px);left:0;width:232px;
 background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--pop);
 padding:8px 11px;cursor:default;}
.tc .calpop.flip{left:auto;right:0;}
.tc .calpop.up{top:auto;bottom:calc(100% + 5px);}
.tc .calpoprow{display:flex;justify-content:space-between;gap:10px;font-size:12px;font-weight:600;
 padding:4px 0;line-height:1.35;text-align:left;}
.tc .calpoprow .num{white-space:nowrap;flex:none;}
.tc .calpoprow em{font-style:normal;}

/* the month outlook line under the thesis */
.tc .outlook{font-size:14px;font-weight:500;color:var(--soft);line-height:1.55;
 max-width:760px;margin:-12px 0 20px;}

/* the household status hero — Home's answer to "are we okay?" */
.tc .hero{background:var(--surface);border:1px solid rgba(224,222,206,.6);border-radius:24px;
 padding:26px 28px;box-shadow:var(--shadow);margin-bottom:18px;}
.tc .hero .hline{font-size:clamp(20px,2.4vw,27px);font-weight:800;letter-spacing:-.02em;line-height:1.25;}
.tc .hero .hsub{font-size:14px;color:var(--soft);font-weight:500;line-height:1.6;margin-top:9px;max-width:740px;}
.tc .herofigs{display:flex;gap:36px;flex-wrap:wrap;margin-top:18px;}
.tc .herofigs .v{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;
 font-size:25px;letter-spacing:-.02em;line-height:1.1;}
.tc .recrow{display:flex;gap:9px;flex-wrap:wrap;margin-top:17px;padding-top:16px;
 border-top:1px solid var(--surface2);align-items:center;}
.tc .recitem{background:var(--brand-soft);color:var(--brand-deep);border-radius:12px;padding:8px 13px;
 font-size:13px;font-weight:700;}

/* the money-meeting wizard */
.tc .meetdots{display:flex;gap:6px;margin-bottom:20px;}
.tc .meetdots i{width:36px;height:5px;border-radius:3px;background:var(--line);}
.tc .meetdots i.done{background:var(--brand);}
.tc .meetbig{font-size:clamp(19px,2.2vw,24px);font-weight:800;letter-spacing:-.02em;line-height:1.3;margin-bottom:9px;}

/* the stewardship flow — one story, top to bottom */
.tc .flowspine{display:flex;flex-direction:column;align-items:center;gap:0;}
.tc .flowarrow{color:var(--soft);font-size:19px;padding:10px 0;line-height:1;}
.tc .flowlabel{font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--soft);
 font-weight:700;text-align:center;margin-bottom:10px;}

/* hover only where there's a pointer */
@media(hover:hover){
 .tc .side nav button:hover{background:var(--surface2);color:var(--ink);}
 .tc .side nav button.on:hover{background:var(--brand-deep);color:#fff;}
 .tc .arrow:hover{background:var(--brand-soft);color:var(--brand);}
 .tc .amt input:hover{border-bottom:1px solid var(--line);}
 .tc .kill:hover{color:var(--warn);}
 .tc .btn:hover{background:var(--brand-deep);}
 .tc .btn.ghost:hover{background:var(--surface2);border-color:var(--brand);color:var(--brand);}
 .tc .chip:hover{background:var(--brand-soft);color:var(--brand);}
 .tc .chip.on:hover{background:var(--brand-deep);color:#fff;}
 .tc .envrow:hover,.tc .morelist button:hover,.tc .check:hover{background:var(--surface2);}
 .tc .calcell:hover{border-color:var(--brand);}
 .tc .calcell:hover .calpop{display:block;}
}

/* ==================================================================
   touch band
   ================================================================== */
@media(max-width:899px){
 .tc .shell{grid-template-columns:minmax(0,1fr);}
 .tc .side{display:none;}
 .tc .main{padding:16px 16px calc(var(--tab-h) + var(--safe-b) + 28px);}
 .tc .thesis,.tc .logger,.tc .desk-only{display:none;}
 .tc .phone-only{display:block;}

 .tc .tabbar{display:grid;grid-template-columns:repeat(5,1fr);position:fixed;inset:auto 0 0 0;
  z-index:40;background:var(--surface);border-top:1px solid var(--line);
  box-shadow:var(--lift);padding-bottom:var(--safe-b);}
 .tc .tab{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
  height:var(--tab-h);background:none;border:none;padding:0;position:relative;
  color:var(--soft);font-size:10.5px;font-weight:600;}
 .tc .tab.on{color:var(--brand);}
 .tc .tab.on::before{content:"";position:absolute;top:0;left:50%;transform:translateX(-50%);
  width:26px;height:3px;border-radius:0 0 3px 3px;background:var(--brand);}
 .tc .tab:active{background:var(--surface2);}
 .tc .tab svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:1.7;
  stroke-linecap:round;stroke-linejoin:round;}

 .tc .fab{right:16px;bottom:calc(var(--tab-h) + var(--safe-b) + 14px);
  width:var(--fab-d);height:var(--fab-d);padding:0;border-radius:50%;justify-content:center;}
 .tc .fab .fablabel{display:none;}
 .tc .fab .fabplus{font-size:26px;}

 /* the keypad replaces the keyboard on phones */
 .tc .amtbig{display:none;}
 .tc .amtdisplay{display:block;}
 .tc .padgrid{display:grid;}

 /* 16px is the floor that stops iOS zooming on focus */
 .tc input,.tc select,.tc textarea{font-size:16px;}
 .tc .field{min-height:var(--tap);padding:11px 13px;}
 .tc .amt input,.tc .rowname input{font-size:16px;padding:6px 0;}
 .tc select.tag{font-size:16px;padding:6px 10px;max-width:none;}
 .tc .tag{min-height:38px;padding:9px 13px;font-size:11px;display:inline-flex;align-items:center;}
 .tc .btn{min-height:var(--tap);padding:11px 18px;font-size:15px;}
 .tc .btn.tiny{min-height:40px;padding:8px 13px;font-size:13.5px;}
 .tc .chip{min-height:40px;padding:9px 15px;font-size:13.5px;display:inline-flex;align-items:center;}
 .tc .arrow{width:40px;height:40px;font-size:17px;}
 .tc .kill{padding:11px;margin:-11px;font-size:17px;}
 .tc .row{padding:12px 0;}
 .tc .kpi .val{font-size:20px;white-space:nowrap;overflow-wrap:normal;}
 .tc .phead{flex-direction:column;align-items:stretch;gap:10px;padding-bottom:10px;margin-bottom:14px;}
 .tc .phead h1{font-size:21px;}
 .tc .monthnav{justify-content:space-between;}
 .tc .monthnav .m{font-size:15px;min-width:0;}
 .tc .g23{grid-template-columns:minmax(0,1fr);}

 /* the calendar tightens up; the detail panel below does the talking */
 .tc .calgrid,.tc .calhead{gap:4px;}
 .tc .calblank,.tc .calcell{min-height:54px;border-radius:10px;}
 .tc .calcell{padding:5px 6px;}
 .tc .calspent{display:none;}
 .tc .calpop{display:none!important;}
 .tc .outlook{margin:0 0 16px;}
 .tc .hero{padding:18px;border-radius:20px;}
 .tc .herofigs{gap:22px;}
 .tc .herofigs .v{font-size:21px;}

 .tc .d-state{order:1;} .tc .d-setup{order:2;} .tc .d-next{order:3;}
 .tc .d-pace{order:4;}  .tc .d-envs{order:5;}  .tc .d-due{order:6;}
 .tc .d-budget{order:7;} .tc .d-most{order:8;} .tc .d-steps{order:9;}
 .tc .d-notes{order:10;} .tc .d-recent{order:11;}
 .tc .d-goals{order:12;} .tc .d-kpis{order:13;} .tc .d-rail{order:14;}
 .tc .d-cats{order:15;}  .tc .d-flow{order:16;}
}

@media(max-width:599px){
 .tc .grid{grid-template-columns:minmax(0,1fr);gap:12px;}
 .tc .g4,.tc .g3{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
 .tc .g3>:last-child:nth-child(odd){grid-column:1/-1;}
 .tc .pair{grid-template-columns:minmax(0,1fr);}
 .tc .card{padding:14px 15px;}
 .tc .chartbox,.tc .chartbox.tall,.tc .chartbox.short{height:170px;}
}

@media(prefers-reduced-motion:reduce){.tc *{transition:none!important;animation:none!important;}}
`;
