/* ── Ansa marketing site — interactions ─────────────────── */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* nav scroll state */
  var nav = document.getElementById('nav');
  function onScroll() { nav.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* scroll reveal */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* duplicate ticker strip for a seamless marquee */
  var track = document.getElementById('ticker');
  if (track) {
    var strip = track.querySelector('.ticker-strip');
    if (strip) {
      track.appendChild(strip.cloneNode(true));
      var x = 0, w = strip.offsetWidth;
      function tick() {
        x -= 0.5;
        if (-x >= w) x = 0;
        track.style.transform = 'translateX(' + x + 'px)';
        requestAnimationFrame(tick);
      }
      if (!reduce) requestAnimationFrame(tick);
    }
  }

  /* count-up stats */
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-target'));
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';
    if (reduce) { el.textContent = prefix + target + suffix; return; }
    var start = null, dur = 1100;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var counts = document.querySelectorAll('.count');
  if ('IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { countUp(e.target); cio.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    counts.forEach(function (el) { cio.observe(el); });
  } else {
    counts.forEach(countUp);
  }

  /* ── Hero chat: scripted conversation → lead capture ───── */
  var body = document.getElementById('wm-body');
  var ph = document.getElementById('wm-ph');
  var chip = document.getElementById('lead-chip');
  var script = [
    { who: 'bot', text: "Hi! 👋 We're Comfort Air. How can we help today?" },
    { who: 'user', text: "My AC stopped cooling — do you do same-day?" },
    { who: 'bot', text: "We do! Same-day AC repair runs from $89 for the diagnostic, and we're in Austin + 30 miles. Want me to get a tech out to you?" },
    { who: 'user', text: "Yes please, today if you can" },
    { who: 'form' }
  ];

  function bubble(item) {
    var el = document.createElement('div');
    if (item.who === 'form') {
      el.className = 'bubble form';
      el.innerHTML =
        '<div class="bf-title">📋 Quick details so we can call you back</div>' +
        '<div class="bf-input">Name · <b>Sarah Whitman</b></div>' +
        '<div class="bf-input">Phone · <b>(512) 555-0148</b></div>' +
        '<div class="bf-input">Service · <b>AC not cooling — ASAP</b></div>' +
        '<div class="bf-btn">Send to Comfort Air →</div>';
    } else {
      el.className = 'bubble ' + item.who;
      el.textContent = item.text;
    }
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }

  function typing() {
    var t = document.createElement('div');
    t.className = 'typing';
    t.innerHTML = '<i></i><i></i><i></i>';
    body.appendChild(t);
    body.scrollTop = body.scrollHeight;
    return t;
  }

  function runChat() {
    if (!body) return;
    body.innerHTML = '';
    if (chip) chip.classList.remove('show');
    var i = 0;
    function next() {
      if (i >= script.length) {
        if (chip) chip.classList.add('show');
        setTimeout(function () { runChat(); }, 6500); // loop
        return;
      }
      var item = script[i++];
      if (item.who === 'bot' || item.who === 'form') {
        var t = typing();
        setTimeout(function () {
          t.remove();
          bubble(item);
          if (ph) ph.textContent = item.who === 'form' ? 'Lead captured ✓' : 'Ask about pricing, hours, service area…';
          setTimeout(next, item.who === 'form' ? 900 : 1100);
        }, item.who === 'form' ? 900 : 1000);
      } else {
        bubble(item);
        if (ph) ph.textContent = 'Typing…';
        setTimeout(next, 1200);
      }
    }
    next();
  }
  if (!reduce) {
    setTimeout(runChat, 700);
  } else if (body) {
    script.forEach(bubble);
    if (chip) chip.classList.add('show');
  }

  /* FAQ — keep one open at a time */
  var faqs = document.querySelectorAll('.faq-item');
  faqs.forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (d.open) faqs.forEach(function (o) { if (o !== d) o.open = false; });
    });
  });

  /* demo CTA form */
  var form = document.getElementById('cta-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = document.getElementById('cta-email');
      var msg = document.getElementById('cta-msg');
      var val = (email.value || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) {
        msg.style.color = '#c2453f';
        msg.textContent = 'Please enter a valid email.';
        return;
      }
      msg.style.color = '';
      msg.textContent = "✓ Thanks! We'll reach out within one business day to set up your demo.";
      form.reset();
    });
  }

  /* gentle magnetic buttons (desktop, pointer-fine) */
  if (window.matchMedia('(pointer: fine)').matches && !reduce) {
    document.querySelectorAll('.magnetic').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var r = btn.getBoundingClientRect();
        var mx = e.clientX - r.left - r.width / 2;
        var my = e.clientY - r.top - r.height / 2;
        btn.style.transform = 'translate(' + mx * 0.12 + 'px,' + my * 0.18 + 'px)';
      });
      btn.addEventListener('mouseleave', function () { btn.style.transform = ''; });
    });
  }
})();
