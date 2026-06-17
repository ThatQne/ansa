/* ════════════════════════════════════════════════════════════════
   Ansa — AI receptionist widget  ·  v0.4
   ----------------------------------------------------------------
   Two modes, automatic:

   • CONNECTED (data-api set → your Ansa server):
       - greeting + starter questions are AUTO-GENERATED from the
         business's own website (the server builds the FAQ).
       - answers come from the LLM, grounded in the scraped site.
       - lead capture is CONVERSATIONAL: the server reads the chat,
         auto-fills name/phone/email/service, asks only for what's
         missing, then delivers the lead across every channel.
       - the API key lives only on the server — never here.

   • LOCAL fallback (no server / server down):
       - bundled knowledge + keyword answers + a short form.
       - KB-bound, so it can't be jailbroken or leak anything.

   Booking: data-cal="you/event" opens a real Cal.com popup.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__ansaLoaded) return;
  window.__ansaLoaded = true;

  /* ── 1. Config ───────────────────────────────────────────────── */
  var tag = document.currentScript || (function () { var s = document.getElementsByTagName('script'); return s[s.length - 1]; })();
  function attr(n, d) { var v = tag.getAttribute(n); return v == null ? d : v; }
  var cfg = {
    id:       attr('data-id', 'ansa'),
    name:     attr('data-name', 'Ansa'),
    accent:   attr('data-accent', '#4f46e5'),
    greeting: attr('data-greeting', "Hi! I'm Ansa — the AI receptionist this whole site is about. Ask me anything, or I'll book you a quick demo."),
    cal:      attr('data-cal', ''),
    webhook:  attr('data-webhook', ''),
    kbUrl:    attr('data-kb', '')
  };
  var api = attr('data-api', '');
  var chatEp = attr('data-llm-endpoint', '');           // back-compat
  if (!api && chatEp) api = chatEp.replace(/\/chat\/?$/, '');
  var EP = api ? { chat: api + '/chat', faq: api + '/faq', lead: api + '/lead' } : null;
  var MAX_INPUT = 600, MAX_HISTORY = 12;
  // stable per-conversation id so the server can remember context across messages
  var SESSION = (function(){ try{ var k='ansa_sess_'+cfg.id, s=sessionStorage.getItem(k); if(!s){ s=Date.now().toString(36)+Math.random().toString(36).slice(2,8); sessionStorage.setItem(k,s);} return s; }catch(e){ return 's'+Math.random().toString(36).slice(2); } })();

  /* ── 2. Local KB (fallback only) ─────────────────────────────── */
  var KB = [
    { k:['what is ansa','what do you do','about','explain','tell me about'], a:"Ansa is an AI receptionist for local service businesses. I live on your website, answer customer questions from your own pages, and capture leads so you never miss a job." },
    { k:['how','setup','install','get started','works','steps'], a:"Setup takes about a day. Send your website URL, I learn your pages, then one line of code goes on your site. You're capturing leads the same afternoon." },
    { k:['price','pricing','cost','how much','plan','fee','setup fee'], a:"Flat monthly, cancel anytime: Starter $129, Pro $249 (most popular), Growth $499. Optional one-time setup $299, often waived early." },
    { k:['lead','leads','capture','deliver','email','sms','sheet','crm','filter','group'], a:"On intent I collect name, phone, email and the job, auto-tag it by service and urgency, then deliver instantly by email, SMS and Google Sheets, or to your CRM." },
    { k:['who','industry','hvac','plumb','electric','roof','dental'], a:"Built for local service businesses — HVAC, plumbing, electrical, roofing, dental and similar trades." },
    { k:['book','booking','appointment','schedule','demo','cal','slot','time'], a:"Yes — I can book appointments. With Cal.com connected, customers pick a real slot inside the chat. Want to book a quick demo right now?", lead:true },
    { k:['secure','security','safe','data','privacy','leak','abuse'], a:"The assistant is locked to your business, stays on topic, and never exposes keys or data — those live on a secure server, never in the page." }
  ];
  function mergeExtra(list){ if(Array.isArray(list)) list.forEach(function(e){ if(e&&e.a) KB.push({k:(e.k||[]).concat(e.q?[String(e.q).toLowerCase()]:[]),a:e.a}); }); }
  try { mergeExtra(window.ANSA_KB_EXTRA); } catch(e){}
  if (cfg.kbUrl) { try { fetch(cfg.kbUrl).then(function(r){return r.json();}).then(mergeExtra).catch(function(){}); } catch(e){} }
  var INTENT = ['book','booking','demo','appointment','schedule','sign up','signup','get started','interested','set up a','talk to','call me','contact me','reach out','sign me up'];
  function norm(s){ return (s||'').toLowerCase().replace(/[^a-z0-9\s]/g,' '); }
  function retrieve(q){ var t=norm(q),best=null,bs=0; KB.forEach(function(e){ var s=0; e.k.forEach(function(kw){ if(t.indexOf(kw)!==-1) s+=kw.indexOf(' ')!==-1?2.2:1; }); if(s>bs){bs=s;best=e;} }); return {entry:best,score:bs}; }
  function isBooking(q){ var t=norm(q); return INTENT.some(function(p){return t.indexOf(p)!==-1;}); }

  /* ── 3. Lead tagging (local mode) ────────────────────────────── */
  function classify(lead){
    var blob=norm([lead.service,lead.when,lead.kind,(lead.transcript||[]).filter(function(m){return m.role==='user';}).map(function(m){return m.text;}).join(' ')].join(' '));
    lead.urgency=/(emergenc|urgent|asap|right now|today|tonight|no (ac|heat|cool|hot water|power)|not (work|cool|turn)|broke|leak|flood|burst)/.test(blob)?'emergency':'standard';
    lead.category=lead.kind==='demo'?'demo':/(install|replace|new (system|unit|ac|furnace|panel|roof)|upgrade|quote|estimate)/.test(blob)?'install/quote':/(repair|fix|broke|not (work|cool)|leak|noise|frozen|won)/.test(blob)?'repair':/(maintenance|tune|service plan|seasonal|inspect)/.test(blob)?'maintenance':'general';
    lead.tags=[lead.category,lead.urgency]; return lead;
  }

  /* ── 4. Icons ────────────────────────────────────────────────── */
  var P={chat:'<path d="M4 6h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-5 4V7a1 1 0 0 1 1-1z"/><path d="M8 10h8M8 13h5"/>',close:'<path d="M6 6l12 12M18 6L6 18"/>',minus:'<path d="M6 12h12"/>',send:'<path d="M4 12h15M13 6l6 6-6 6"/>',bolt:'<path d="M13 3 5 13h6l-1 8 8-10h-6l1-8z"/>',dollar:'<path d="M12 2v20M17 5.5H9.8a3.3 3.3 0 0 0 0 6.5h4.4a3.3 3.3 0 0 1 0 6.6H6"/>',gear:'<circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2.2-1.3L13.9 2h-3.8l-.4 2.6a7 7 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.3l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2.2 1.3l.4 2.6h3.8l.4-2.6a7 7 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6A7 7 0 0 0 19 12z"/>',pin:'<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4M8 14l2.4 2.4L16 11"/>',check:'<path d="M5 13l4 4 10-11"/>',clipboard:'<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>',chevron:'<path d="M9 6l6 6-6 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'};
  function ic(n,cls){ return '<svg class="ansa-ic '+(cls||'')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(P[n]||'')+'</svg>'; }
  function iconFor(label){ var t=(label||'').toLowerCase(); if(/pric|cost|quote|\$/.test(t))return'dollar'; if(/hour|open|time/.test(t))return'clock'; if(/area|where|location|serve/.test(t))return'pin'; if(/book|appoint|schedul|demo|visit/.test(t))return'calendar'; if(/how|setup|install|work/.test(t))return'gear'; return'chat'; }
  var MARK='<svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M16 16h32a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H32l-11 9v-9h-5a6 6 0 0 1-6-6V22a6 6 0 0 1 6-6z" fill="currentColor"/><circle cx="25" cy="30" r="3" fill="#fff"/><circle cx="33" cy="30" r="3" fill="#fff"/><circle cx="41" cy="30" r="3" fill="#fff"/></svg>';

  /* ── 5. Colors + styles ──────────────────────────────────────── */
  function hexToRgb(h){h=h.replace('#','');if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)];}
  function rgba(h,a){var c=hexToRgb(h);return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')';}
  function shade(h,p){var c=hexToRgb(h);return '#'+c.map(function(v){v=Math.round(v+(p/100)*255);return ('0'+Math.max(0,Math.min(255,v)).toString(16)).slice(-2);}).join('');}
  var A=cfg.accent;
  var css=`
  .ansa-root{position:fixed;right:24px;bottom:24px;z-index:2147483000;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0b0d14}
  .ansa-root *{box-sizing:border-box}.ansa-ic{width:1em;height:1em;flex-shrink:0}
  .ansa-launch{width:64px;height:64px;border-radius:50%;border:none;cursor:pointer;display:grid;place-items:center;color:#fff;background:linear-gradient(155deg,${shade(A,10)},${shade(A,-20)});box-shadow:0 14px 34px -8px ${rgba(A,.6)},0 4px 12px rgba(0,0,0,.14),inset 0 1px 0 rgba(255,255,255,.25);transition:transform .35s cubic-bezier(.32,1.5,.45,1);position:relative}
  .ansa-launch:hover{transform:scale(1.06)}.ansa-launch:active{transform:scale(.94)}
  .ansa-launch .ansa-ic{width:27px;height:27px;position:absolute;transition:opacity .25s,transform .35s}
  .ansa-launch .ic-close{opacity:0;transform:rotate(-40deg) scale(.6)}
  .ansa-root.open .ansa-launch .ic-chat{opacity:0;transform:rotate(40deg) scale(.6)}
  .ansa-root.open .ansa-launch .ic-close{opacity:1;transform:none}
  .ansa-badge{position:absolute;top:-2px;right:-2px;min-width:20px;height:20px;padding:0 5px;border-radius:99px;background:#ef4444;color:#fff;font-size:11px;font-weight:700;display:grid;place-items:center;border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.2)}
  .ansa-root.open .ansa-badge{display:none}
  .ansa-nudge{position:absolute;right:78px;bottom:10px;width:248px;background:#fff;border:1px solid rgba(13,16,28,.1);border-radius:16px;border-bottom-right-radius:5px;padding:13px 15px;font-size:13.5px;line-height:1.5;color:#2c3140;box-shadow:0 16px 40px -12px rgba(13,16,28,.32);opacity:0;transform:translateY(8px) scale(.95);transition:opacity .4s,transform .4s;pointer-events:none}
  .ansa-nudge.show{opacity:1;transform:none;pointer-events:auto}.ansa-nudge b{color:#0b0d14}
  .ansa-nudge .x{position:absolute;top:-8px;right:-8px;width:22px;height:22px;border-radius:50%;background:#fff;border:1px solid rgba(13,16,28,.12);color:#8b90a0;font-size:14px;line-height:1;cursor:pointer;display:grid;place-items:center;box-shadow:0 2px 6px rgba(13,16,28,.12)}
  .ansa-panel{position:absolute;right:0;bottom:80px;width:388px;max-width:calc(100vw - 36px);height:600px;max-height:calc(100vh - 130px);background:#fff;border:1px solid rgba(13,16,28,.09);border-radius:22px;box-shadow:0 36px 90px -26px rgba(13,16,28,.44),0 10px 24px -10px rgba(13,16,28,.18);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(18px) scale(.98);transform-origin:bottom right;pointer-events:none;transition:opacity .3s cubic-bezier(.22,1,.36,1),transform .35s cubic-bezier(.22,1,.36,1)}
  .ansa-root.open .ansa-panel{opacity:1;transform:none;pointer-events:auto}
  .ansa-head{display:flex;align-items:center;gap:12px;padding:17px 18px;background:linear-gradient(150deg,${shade(A,8)},${shade(A,-18)});color:#fff}
  .ansa-head .av{width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,.18);display:grid;place-items:center;flex-shrink:0}
  .ansa-head .av svg{width:23px;height:23px}.ansa-head .ht{line-height:1.35;flex:1;min-width:0}
  .ansa-head .ht b{display:block;font-size:15.5px;font-weight:700;letter-spacing:-.01em}
  .ansa-head .ht span{font-size:12px;opacity:.9;display:flex;align-items:center;gap:6px}
  .ansa-head .ht .on{width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 0 rgba(74,222,128,.6);animation:ansa-pulse 2.4s infinite}
  .ansa-min{background:rgba(255,255,255,.16);border:none;color:#fff;width:32px;height:32px;border-radius:10px;cursor:pointer;display:grid;place-items:center;flex-shrink:0}
  .ansa-min:hover{background:rgba(255,255,255,.26)}.ansa-min .ansa-ic{width:18px;height:18px}
  @keyframes ansa-pulse{0%{box-shadow:0 0 0 0 rgba(74,222,128,.5)}70%{box-shadow:0 0 0 7px rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}
  .ansa-body{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:11px;background:#f6f7fb;scroll-behavior:smooth}
  .ansa-body::-webkit-scrollbar{width:6px}.ansa-body::-webkit-scrollbar-thumb{background:rgba(13,16,28,.14);border-radius:99px}
  .ansa-msg{max-width:85%;font-size:14px;line-height:1.5;padding:11px 14px;border-radius:16px;animation:ansa-in .35s cubic-bezier(.22,1,.36,1);word-wrap:break-word}
  @keyframes ansa-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  .ansa-bot{align-self:flex-start;background:#fff;border:1px solid rgba(13,16,28,.08);border-bottom-left-radius:5px;box-shadow:0 1px 2px rgba(13,16,28,.05)}
  .ansa-user{align-self:flex-end;color:#fff;border-bottom-right-radius:5px;background:linear-gradient(180deg,${shade(A,10)},${A})}
  .ansa-typing{align-self:flex-start;display:inline-flex;gap:4px;padding:14px 15px;background:#fff;border:1px solid rgba(13,16,28,.08);border-radius:16px;border-bottom-left-radius:5px}
  .ansa-typing i{width:6px;height:6px;border-radius:50%;background:#b6bbc8;animation:ansa-dot 1.2s infinite ease-in-out}
  .ansa-typing i:nth-child(2){animation-delay:.18s}.ansa-typing i:nth-child(3){animation-delay:.36s}
  @keyframes ansa-dot{0%,60%,100%{transform:translateY(0);opacity:.4}30%{transform:translateY(-4px);opacity:1}}
  .ansa-chips{display:flex;flex-wrap:wrap;gap:8px;align-self:flex-start;margin:2px 0 4px}
  .ansa-chip{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:${A};background:#fff;border:1px solid ${rgba(A,.32)};border-radius:99px;padding:8px 13px;cursor:pointer;transition:background .15s,transform .2s,box-shadow .2s;box-shadow:0 1px 2px rgba(13,16,28,.04)}
  .ansa-chip:hover{background:${rgba(A,.07)};box-shadow:0 4px 12px -4px ${rgba(A,.4)}}.ansa-chip:active{transform:scale(.95)}.ansa-chip .ansa-ic{width:14px;height:14px}
  .ansa-form{align-self:stretch;background:#fff;border:1px solid ${rgba(A,.4)};border-radius:16px;padding:15px;box-shadow:0 10px 28px -14px ${rgba(A,.45)}}
  .ansa-form .ft{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:${A};margin-bottom:12px}.ansa-form .ft .ansa-ic{width:16px;height:16px}
  .ansa-field{margin-bottom:9px}
  .ansa-field input{width:100%;height:40px;border:1px solid rgba(13,16,28,.14);border-radius:11px;padding:0 13px;font:inherit;font-size:13.5px;color:#0b0d14;background:#f6f7fb;transition:border-color .15s,background .15s,box-shadow .15s}
  .ansa-field input:focus{outline:none;border-color:${A};background:#fff;box-shadow:0 0 0 3px ${rgba(A,.14)}}
  .ansa-field input.err{border-color:#ef4444;background:#fef2f2}
  .ansa-submit{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;height:42px;margin-top:5px;border:none;border-radius:11px;color:#fff;font:inherit;font-size:14px;font-weight:600;cursor:pointer;background:linear-gradient(180deg,${shade(A,10)},${A});box-shadow:0 10px 20px -8px ${rgba(A,.6)};transition:transform .2s,opacity .2s}
  .ansa-submit:hover{opacity:.96}.ansa-submit:active{transform:scale(.97)}.ansa-submit:disabled{opacity:.6;cursor:default}.ansa-submit .ansa-ic{width:16px;height:16px}
  .ansa-success{align-self:stretch;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:16px;padding:14px 15px;display:flex;gap:11px;align-items:flex-start}
  .ansa-success .sic{width:26px;height:26px;border-radius:50%;background:#10b981;color:#fff;display:grid;place-items:center;flex-shrink:0}.ansa-success .sic .ansa-ic{width:15px;height:15px}
  .ansa-success .stext{font-size:13.5px;line-height:1.5;color:#065f46}.ansa-success .stext b{color:#064e3b}
  .ansa-foot{padding:13px;border-top:1px solid rgba(13,16,28,.08);background:#fff}
  .ansa-inrow{display:flex;align-items:center;gap:8px;background:#f3f4f8;border:1px solid rgba(13,16,28,.1);border-radius:14px;padding:6px 6px 6px 15px;transition:border-color .15s,background .15s,box-shadow .15s}
  .ansa-inrow:focus-within{border-color:${A};background:#fff;box-shadow:0 0 0 3px ${rgba(A,.12)}}
  .ansa-inrow input{flex:1;border:none;background:transparent;font:inherit;font-size:14px;color:#0b0d14;padding:8px 0}.ansa-inrow input:focus{outline:none}
  .ansa-sendbtn{width:38px;height:38px;border-radius:11px;border:none;cursor:pointer;color:#fff;display:grid;place-items:center;flex-shrink:0;background:linear-gradient(180deg,${shade(A,10)},${A});transition:transform .2s,opacity .2s}
  .ansa-sendbtn:hover{opacity:.95}.ansa-sendbtn:active{transform:scale(.92)}.ansa-sendbtn .ansa-ic{width:18px;height:18px}
  .ansa-brand{display:flex;align-items:center;justify-content:center;gap:5px;font-size:11px;color:#9aa0ae;padding:9px 0 1px}.ansa-brand b{color:#6b7180;font-weight:700}.ansa-brand .ansa-ic{width:12px;height:12px;color:${A}}
  @media(max-width:480px){.ansa-panel{width:calc(100vw - 24px);height:calc(100vh - 100px)}.ansa-root{right:14px;bottom:14px}.ansa-launch{width:58px;height:58px}}
  @media(prefers-reduced-motion:reduce){.ansa-root *{animation-duration:.01ms!important;transition-duration:.01ms!important}}`;
  var styleEl=document.createElement('style');styleEl.textContent=css;document.head.appendChild(styleEl);

  /* ── 6. DOM ──────────────────────────────────────────────────── */
  function esc(s){var d=document.createElement('div');d.textContent=s;return d.innerHTML;}
  var root=document.createElement('div');root.className='ansa-root';
  root.innerHTML=
    '<div class="ansa-panel" role="dialog" aria-label="Chat with '+esc(cfg.name)+'">'+
      '<div class="ansa-head"><div class="av">'+MARK+'</div><div class="ht"><b>'+esc(cfg.name)+'</b><span><i class="on"></i>Replies instantly</span></div>'+
        '<button class="ansa-min" aria-label="Minimize">'+ic('minus')+'</button></div>'+
      '<div class="ansa-body" id="ansa-body"></div>'+
      '<div class="ansa-foot"><div class="ansa-inrow"><input id="ansa-input" type="text" maxlength="'+MAX_INPUT+'" placeholder="Ask me anything…" autocomplete="off" />'+
          '<button class="ansa-sendbtn" id="ansa-send" aria-label="Send">'+ic('send')+'</button></div>'+
        '<div class="ansa-brand">'+ic('bolt')+'Powered by <b>Ansa</b></div></div>'+
    '</div>'+
    '<button class="ansa-launch" aria-label="Open chat"><span class="ansa-badge">1</span>'+ic('chat','ic-chat')+ic('close','ic-close')+'</button>'+
    '<div class="ansa-nudge" id="ansa-nudge"><span class="x" id="ansa-nudge-x">×</span></div>';
  document.body.appendChild(root);
  var bodyEl=root.querySelector('#ansa-body'),input=root.querySelector('#ansa-input'),sendBtn=root.querySelector('#ansa-send'),nudge=root.querySelector('#ansa-nudge');

  /* ── 7. Rendering ────────────────────────────────────────────── */
  var history=[],started=false,captured=false,answeredCount=0,faqData=null;
  function scrollDown(){ bodyEl.scrollTop=bodyEl.scrollHeight; }
  function addMsg(role,text){ var el=document.createElement('div'); el.className='ansa-msg '+(role==='user'?'ansa-user':'ansa-bot'); el.innerHTML=esc(text).replace(/\n/g,'<br>'); bodyEl.appendChild(el); history.push({role:role,text:text}); if(history.length>40)history=history.slice(-40); scrollDown(); return el; }
  function showTyping(){ var t=document.createElement('div'); t.className='ansa-typing'; t.innerHTML='<i></i><i></i><i></i>'; bodyEl.appendChild(t); scrollDown(); return t; }
  function botSay(text,after){ var t=showTyping(),delay=Math.min(1300,400+text.length*11); setTimeout(function(){ t.remove(); addMsg('bot',text); if(after)after(); },delay); }
  function addChips(items){ var w=document.createElement('div'); w.className='ansa-chips'; items.forEach(function(it){ var b=document.createElement('button'); b.className='ansa-chip'; b.innerHTML=ic(it.icon||iconFor(it.label))+'<span>'+esc(it.label)+'</span>'; b.onclick=function(){ w.remove(); handleUser(it.send,it.label); }; w.appendChild(b); }); bodyEl.appendChild(w); scrollDown(); }
  function successCard(name,msg){ var s=document.createElement('div'); s.className='ansa-success'; s.innerHTML='<div class="sic">'+ic('check')+'</div><div class="stext"><b>Thanks'+(name?', '+esc(name):'')+'!</b><br>'+msg+'</div>'; bodyEl.appendChild(s); scrollDown(); }

  /* ── 8. Startup: auto-FAQ greeting + starters ────────────────── */
  function defaultStarters(){ return [{label:'Pricing',send:'How much does it cost?'},{label:'How setup works',send:'How does setup work?'},{label:'Who it’s for',send:'Who is it for?'},{label:'Book a demo',send:'__book__'}]; }
  function start(){
    if(started) return; started=true;
    var greet=(faqData&&faqData.greeting)||cfg.greeting;
    var starters=(faqData&&faqData.starters&&faqData.starters.length)?faqData.starters:defaultStarters();
    botSay(greet,function(){ addChips(starters); });
  }
  function boot(){ // fetch auto-generated FAQ before greeting, if connected
    if(EP){ fetch(EP.faq+'?id='+encodeURIComponent(cfg.id)).then(function(r){return r.json();}).then(function(d){ faqData=d; }).catch(function(){}).finally(start); }
    else start();
  }

  /* ── 9. Routing: connected (conversational) vs local ─────────── */
  function handleUser(text,label){
    text=(text||'').trim().slice(0,MAX_INPUT); if(!text) return;
    if(text==='__book__'){ addMsg('user','I’d like to book a demo'); beginBooking(); return; }
    if(text==='__more__'){ addMsg('user','I have more questions'); botSay('Of course — ask away.'); return; }
    addMsg('user',text); route(text);
  }
  function route(text){
    if(cfg.cal && isBooking(text)) return openCal();
    if(EP) return serverTurn(text);
    return localTurn(text);
  }
  function serverTurn(text){
    var t=showTyping(),ctrl; try{ctrl=new AbortController();}catch(e){}
    var to=setTimeout(function(){try{ctrl&&ctrl.abort();}catch(e){}},12000);
    fetch(EP.chat,{method:'POST',headers:{'Content-Type':'application/json'},signal:ctrl&&ctrl.signal,
      body:JSON.stringify({id:cfg.id,session:SESSION,message:text,history:history.slice(-MAX_HISTORY*2)})})
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(d){ clearTimeout(to); t.remove(); addMsg('bot',(d&&d.reply)||''); handleCapture(d&&d.capture); })
      .catch(function(){ clearTimeout(to); t.remove(); localTurn(text); });
  }
  function handleCapture(cap){
    if(!cap||captured) return;
    if(cap.ready && cap.collected){
      captured=true;
      var lead=cap.collected; lead.kind=lead.intent==='book'?'demo':'callback'; lead.transcript=history.slice();
      if(EP) fetch(EP.lead,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:cfg.id,session:SESSION,lead:lead})}).catch(function(){});
      try{window.dispatchEvent(new CustomEvent('ansa:lead',{detail:lead}));}catch(e){}
      if(typeof window.onAnsaLead==='function'){try{window.onAnsaLead(lead);}catch(e){}}
      setTimeout(function(){ successCard(lead.name,'Your details are in — '+esc(cfg.name)+' will reach out shortly.'); },400);
    }
  }
  function localTurn(text){
    var r=retrieve(text);
    if(isBooking(text) && (!r.entry||r.score<3)) return openForm('booking');
    if(r.score>=2 && r.entry){ answeredCount++; botSay(r.entry.a,function(){ r.entry.lead?offerDemo():maybeOffer(text); }); }
    else botSay("Great question — the quickest way to a precise answer is a 15-minute demo. Want me to set one up?",offerDemo);
  }
  function maybeOffer(text){ if(captured)return; if(isBooking(text)||answeredCount>=2) setTimeout(function(){ if(!captured)offerDemo(); },500); }
  function offerDemo(){ if(captured)return; botSay("Want to see me working on your own website? I can book a quick demo.",function(){ addChips([{icon:'calendar',label:'Yes, book a demo',send:'__book__'},{icon:'chat',label:'I have more questions',send:'__more__'}]); }); }

  /* ── 10. Booking ─────────────────────────────────────────────── */
  function beginBooking(){
    if(cfg.cal) return openCal();
    if(EP) return serverTurn('I would like to book a demo, please');
    openForm('booking');
  }
  function openCal(){
    try{
      if(!window.Cal){ (function(C,A,L){var p=function(a,ar){a.q.push(ar);};var d=C.document;C.Cal=C.Cal||function(){var cal=C.Cal,ar=arguments;if(!cal.loaded){cal.ns={};cal.q=cal.q||[];d.head.appendChild(d.createElement("script")).src=A;cal.loaded=true;}if(ar[0]===L){var api=function(){p(api,arguments);};var ns=ar[1];api.q=api.q||[];typeof ns==="string"?(cal.ns[ns]=cal.ns[ns]||api)&&p(cal.ns[ns],ar)&&p(cal,["initNamespace",ns]):p(cal,ar);return;}p(cal,ar);};})(window,"https://app.cal.com/embed/embed.js","init");
        window.Cal("init",{origin:"https://cal.com"}); }
      window.Cal("modal",{calLink:cfg.cal}); captured=true;
    }catch(e){ openForm('booking'); }
  }
  function openForm(kind){
    if(captured) return;
    var booking=kind==='booking';
    var form=document.createElement('div'); form.className='ansa-form';
    form.innerHTML='<div class="ft">'+ic(booking?'calendar':'clipboard')+(booking?'Book your free demo':'Request a callback')+'</div>'+
      '<div class="ansa-field"><input data-f="name" type="text" maxlength="80" placeholder="Your name" /></div>'+
      '<div class="ansa-field"><input data-f="email" type="email" maxlength="120" placeholder="Email" /></div>'+
      (booking?'<div class="ansa-field"><input data-f="website" type="text" maxlength="120" placeholder="Your website" /></div><div class="ansa-field"><input data-f="when" type="text" maxlength="80" placeholder="Best day / time" /></div>'
              :'<div class="ansa-field"><input data-f="phone" type="tel" maxlength="32" placeholder="Phone number" /></div><div class="ansa-field"><input data-f="service" type="text" maxlength="120" placeholder="What do you need help with?" /></div>')+
      '<button class="ansa-submit">'+ic('check')+(booking?'Book my demo':'Send')+'</button>';
    bodyEl.appendChild(form); scrollDown();
    var f={}; form.querySelectorAll('input').forEach(function(x){f[x.getAttribute('data-f')]=x;});
    form.querySelector('.ansa-submit').onclick=function(){
      var name=(f.name.value||'').trim(),email=(f.email.value||'').trim(),ok=true;
      if(name.length<2){f.name.classList.add('err');ok=false;}else f.name.classList.remove('err');
      if(booking){ if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){f.email.classList.add('err');ok=false;}else f.email.classList.remove('err'); }
      else { if((f.phone.value||'').replace(/\D/g,'').length<7){f.phone.classList.add('err');ok=false;}else f.phone.classList.remove('err'); }
      if(!ok) return;
      var lead=classify({kind:booking?'demo':'callback',business:cfg.id,name:name,email:email,phone:booking?'':(f.phone.value||'').trim(),website:booking?(f.website.value||'').trim():'',when:booking?(f.when.value||'').trim():'',service:booking?'':(f.service.value||'').trim(),transcript:history.slice(),at:new Date().toISOString()});
      deliverLocal(lead); captured=true;
      var btn=form.querySelector('.ansa-submit'); btn.disabled=true; btn.innerHTML=ic('check')+'Sent';
      form.style.opacity='.6'; form.style.pointerEvents='none';
      successCard(name,(booking?'We’ll email <b>'+esc(email)+'</b> to confirm your demo'+(lead.when?' for '+esc(lead.when):'')+'.':'We’ll reach out shortly.'));
      setTimeout(function(){ botSay("You're all set. Anything else I can help with?"); },900);
    };
  }
  function deliverLocal(lead){
    try{window.dispatchEvent(new CustomEvent('ansa:lead',{detail:lead}));}catch(e){}
    if(typeof window.onAnsaLead==='function'){try{window.onAnsaLead(lead);}catch(e){}}
    try{var key='ansa_leads_'+cfg.id,arr=JSON.parse(localStorage.getItem(key)||'[]');arr.push(lead);localStorage.setItem(key,JSON.stringify(arr));}catch(e){}
    if(EP){ try{fetch(EP.lead,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:cfg.id,session:SESSION,lead:lead})});}catch(e){} }
    else if(cfg.webhook){ try{fetch(cfg.webhook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(lead)});}catch(e){} }
    console.log('%c[Ansa] lead ['+lead.tags.join(', ')+']','color:#10b981;font-weight:700',lead);
  }

  /* ── 11. Input + open/close + API ────────────────────────────── */
  sendBtn.onclick=function(){var v=input.value;input.value='';handleUser(v);};
  input.addEventListener('keydown',function(e){if(e.key==='Enter'){var v=input.value;input.value='';handleUser(v);}});
  function open(){root.classList.add('open');hideNudge();if(!started)boot();setTimeout(function(){input.focus();},350);}
  function close(){root.classList.remove('open');}
  function book(){open();setTimeout(function(){if(!captured)beginBooking();},started?0:1500);}
  root.querySelector('.ansa-launch').onclick=function(){root.classList.contains('open')?close():open();};
  root.querySelector('.ansa-min').onclick=close;
  function showNudge(){ if(root.classList.contains('open'))return; nudge.insertAdjacentHTML('beforeend','<span><b>'+esc(cfg.name)+'</b> — this chat is the live demo. Ask me anything, or book a demo.</span>'); nudge.classList.add('show'); }
  function hideNudge(){nudge.classList.remove('show');}
  root.querySelector('#ansa-nudge-x').onclick=function(e){e.stopPropagation();hideNudge();};
  nudge.addEventListener('click',open);
  setTimeout(showNudge,3200); setTimeout(function(){if(!root.classList.contains('open'))hideNudge();},14000);
  window.Ansa={open:open,close:close,book:book};
  function bind(){ document.querySelectorAll('[data-ansa-open]').forEach(function(el){el.addEventListener('click',function(e){e.preventDefault();open();});}); document.querySelectorAll('[data-ansa-book]').forEach(function(el){el.addEventListener('click',function(e){e.preventDefault();book();});}); }
  if(document.readyState!=='loading')bind(); else document.addEventListener('DOMContentLoaded',bind);
})();
