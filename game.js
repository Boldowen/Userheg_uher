/* ════════════════════════════════════════════════════════════
   game.js — GestureOS v4  "Userхэг Үхэр Edition"
   
   CatchGame — argal.png mascot as the paddle/character
               basket zone collision only (not full body)
               duussan.png shown on game over
   ════════════════════════════════════════════════════════════ */

// ── Preload mascot images globally ──────────────────────────
const IMG = {};
function preloadImg(key, src) {
  const img = new Image();
  img.src = src;
  IMG[key] = img;
}
preloadImg('argalLeft',  './images/aragtai.png');
preloadImg('argalRight', './images/aragtai_rev.png');
preloadImg('duussan',    './images/duussan.png');
preloadImg('waving',     './images/wavingbull.png');
for (let i = 1; i <= 7; i += 1) {
  preloadImg(`fallArgal${i}`, `./images/argal_${i}.png`);
}
// expose for GameOver screen used by engine
window._duussanImg = IMG.duussan;

/* ════════════════════════════════════════════════════════════
   GestureGameEngine — orchestrates all mini-games
   ════════════════════════════════════════════════════════════ */
class GestureGameEngine {
  constructor({ canvas, scoreEl, livesEl, stateEl, levelEl }) {
    this.canvas   = canvas;
    this.ctx      = canvas.getContext('2d');
    this.scoreEl  = scoreEl;
    this.livesEl  = livesEl;
    this.stateEl  = stateEl;
    this.levelEl  = levelEl || null;

    this.currentGame = 'catch';
    this.running  = false;
    this.paused   = false;
    this.pointerX = 0.5;
    this.pointerY = 0.5;
    this._rafId   = null;
    this._loopToken = 0;

    this.hs = this._loadHS();
    this.games = {
      catch:  new CatchGame(this),
      dodge:  new DodgeGame(this),
      paint:  new PaintGame(this),
      memory: new MemoryGame(this),
    };

    this.loop = this.loop.bind(this);
    this.updateUI();
    this.render();
    this._syncHS();
  }

  // Persistence
  _loadHS() {
    try { const s = localStorage.getItem('gOS_hs_v4'); return s ? JSON.parse(s) : {catch:0,dodge:0,paint:0,memory:0}; }
    catch { return {catch:0,dodge:0,paint:0,memory:0}; }
  }
  _saveHS() { try { localStorage.setItem('gOS_hs_v4', JSON.stringify(this.hs)); } catch {} }
  _syncHS() {
    for (const [k, v] of Object.entries(this.hs)) {
      const el = document.getElementById('hs' + k[0].toUpperCase() + k.slice(1));
      if (el) el.textContent = String(v);
    }
  }

  get W() { return this.canvas.width; }
  get H() { return this.canvas.height; }
  get active() { return this.games[this.currentGame]; }

  setPointerXY(x, y) {
    this.pointerX = Math.max(0, Math.min(1, x));
    this.pointerY = Math.max(0, Math.min(1, y));
    if (this.running && !this.paused) this.active.onPointerMove(this.pointerX, this.pointerY);
  }
  setPointerX(x) { this.setPointerXY(x, this.pointerY); }

  switchGame(name) {
    const was = this.running;
    this.stop();
    this.currentGame = name;
    this.active.reset();
    this.updateUI();
    this.render();
    if (was) this.start();
  }

  _cancelLoop() {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  _scheduleLoop() {
    if (this._rafId !== null) return;
    const token = this._loopToken;
    this._rafId = requestAnimationFrame((ts) => {
      this._rafId = null;
      this.loop(ts, token);
    });
  }

  start()  {
    if (this.running && !this.paused) return;
    this.running = true;
    this.paused = false;
    this.stateEl.textContent = 'Running';
    this._scheduleLoop();
  }
  stop()   {
    this._loopToken++;
    this._cancelLoop();
    this.running = false;
    this.paused = false;
    this.stateEl.textContent = 'Stopped';
    this.render();
  }
  togglePause() {
    if (!this.running) return;
    this.paused = !this.paused;
    this.stateEl.textContent = this.paused ? 'Paused' : 'Running';
    if (this.paused) {
      this._loopToken++;
      this._cancelLoop();
      this.render();
    } else {
      this._scheduleLoop();
    }
  }
  restart() {
    this._loopToken++;
    this._cancelLoop();
    this.active.reset();
    this.updateUI();
    this.running = true;
    this.paused = false;
    this.stateEl.textContent = 'Running';
    this.render();
    this._scheduleLoop();
  }

  updateUI() {
    const g = this.active;
    this.scoreEl.textContent = String(g.score ?? 0);
    this.livesEl.textContent = String(g.lives ?? g.maxLives ?? 3);
    if (this.levelEl) this.levelEl.textContent = String(g.level ?? 1);
  }

  // Called by games to push scores / lives
  onScore(s) {
    this.scoreEl.textContent = String(s);
    const k = this.currentGame;
    if (s > this.hs[k]) {
      this.hs[k] = s; this._saveHS();
      const el = document.getElementById('hs' + k[0].toUpperCase() + k.slice(1));
      if (el) { el.textContent = String(s); el.classList.add('hs-new'); setTimeout(() => el.classList.remove('hs-new'), 800); }
    }
  }
  onLives(v) {
    this.livesEl.textContent = String(v);
    if (v <= 0) this.gameOver();
  }
  onLevel(v) { if (this.levelEl) this.levelEl.textContent = String(v); }

  gameOver() {
    this._loopToken++;
    this._cancelLoop();
    this.running = false;
    this.paused = false;
    this.stateEl.textContent = 'Game Over';
    this.render();
  }

  loop(ts, token = this._loopToken) {
    if (token !== this._loopToken || !this.running || this.paused) return;
    this.active.update(ts);
    this.render();
    if (this.running && !this.paused) this._scheduleLoop();
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this.active.draw(ctx, this.W, this.H);
    if (this.paused)                                      this._drawPause(ctx);
    else if (!this.running && this.stateEl.textContent !== 'Stopped') this._drawGameOver(ctx);
    else if (!this.running)                               this._drawIdle(ctx);
  }

  _drawIdle(ctx) {
    ctx.fillStyle = 'rgba(253,245,232,.88)'; ctx.fillRect(0,0,this.W,this.H);
    const img = IMG.waving;
    if (img.complete && img.naturalWidth) {
      const ih = Math.min(this.H * .6, 260), iw = ih * img.naturalWidth / img.naturalHeight;
      ctx.drawImage(img, this.W/2 - iw/2, this.H * .05, iw, ih);
    }
    ctx.textAlign = 'center';
    ctx.font = 'bold 26px Nunito,sans-serif'; ctx.fillStyle = '#7a4218';
    ctx.fillText('▶ START дарж тоглоом эхлүүл!', this.W/2, this.H * .82);
    ctx.font = '15px Nunito,sans-serif'; ctx.fillStyle = '#896040';
    ctx.fillText('Userхэг Үхэр таны дохиог хүлээж байна 🐂', this.W/2, this.H * .9);
    ctx.textAlign = 'left';
  }

  _drawGameOver(ctx) {
    ctx.fillStyle = 'rgba(253,245,232,.9)'; ctx.fillRect(0,0,this.W,this.H);
    const img = IMG.duussan;
    if (img.complete && img.naturalWidth) {
      const ih = Math.min(this.H * .52, 250), iw = ih * img.naturalWidth / img.naturalHeight;
      ctx.drawImage(img, this.W/2 - iw/2, this.H * .04, iw, ih);
    }
    ctx.textAlign = 'center';
    ctx.font = 'bold 38px Nunito,sans-serif'; ctx.fillStyle = '#cc3838';
    ctx.fillText('ТОГЛООМ ДУУСЛАА!', this.W/2, this.H * .68);
    ctx.font = '20px Nunito,sans-serif'; ctx.fillStyle = '#c8880e';
    ctx.fillText('Оноо: ' + this.scoreEl.textContent, this.W/2, this.H * .77);
    ctx.font = '15px Nunito,sans-serif'; ctx.fillStyle = '#896040';
    ctx.fillText('↺ Restart дарж дахин оролдоорой', this.W/2, this.H * .87);
    ctx.textAlign = 'left';
  }

  _drawPause(ctx) {
    ctx.fillStyle = 'rgba(253,245,232,.78)'; ctx.fillRect(0,0,this.W,this.H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 40px Nunito,sans-serif'; ctx.fillStyle = '#c8880e';
    ctx.fillText('⏸ Зогссон', this.W/2, this.H/2 - 10);
    ctx.font = '16px Nunito,sans-serif'; ctx.fillStyle = '#896040';
    ctx.fillText('✊ Нударга дохио → үргэлжлүүл', this.W/2, this.H/2 + 30);
    ctx.textAlign = 'left';
  }
}

/* ════════════════════════════════════════════════════════════
   CATCH GAME — "Userхэг Үхэр — Argal Catch"

   Layout of argal mascot (basket-carrying bull):
   ┌─────────────┐  charH = 140px
   │  head+body  │  ← upper 55% of image
   │  ███████    │
   │  [basket]   │  ← basket starts at ~55% from top
   │  ─────────  │    basket zone width ≈ 68% of char width
   └─────────────┘
   
   Collision ONLY happens when a falling object enters the
   basket zone rectangle (bottom ~42% of character, inset).
   ════════════════════════════════════════════════════════════ */
class CatchGame {
  constructor(engine) {
    this.engine = engine;
    this.maxLives = 3;
    this.reset();
  }

  reset() {
    this.score     = 0;
    this.lives     = this.maxLives;
    this.level     = 1;
    this.objects   = [];
    this.particles = [];
    this.floats    = [];   // floating score text
    this.paddleX   = 0.5;
    this.lastPaddleX = 0.5;
    this.faceDir   = 'left';
    this.lastSpawn = -9999; // first argal appears immediately after Start
    this.spawnInt  = 700;
    this.combo     = 0;
    this.comboTs   = 0;
    this.shake     = 0;

    // Mascot character dimensions (px on canvas)
    this.charW  = 112;  // character total width
    this.charH  = 156;  // character total height
    // Basket zone: starts at 52% down from charTop, inset 18% on each side
    this.bktTop = 0.52; // basket top Y as fraction of charH
    this.bktInX = 0.12; // horizontal inset fraction
  }

  onPointerMove(x) {
    const nx = Math.max(0, Math.min(1, x));
    if (Math.abs(nx - this.paddleX) > 0.01) {
      // Зүүн тийш хөдөлбөл aragtai.png, баруун тийш хөдөлбөл aragtai_rev.png
      this.faceDir = nx < this.paddleX ? 'left' : 'right';
    }
    this.lastPaddleX = this.paddleX;
    this.paddleX = nx;
  }

  // Returns { x,y,w,h } of the basket zone in canvas coords
  _basket(W, H) {
    const cx   = this.paddleX * W;
    const cl   = cx - this.charW / 2;         // char left
    const ct   = H - this.charH - 12;         // char top
    const bx   = cl  + this.charW  * this.bktInX;
    const by   = ct  + this.charH  * this.bktTop;
    const bw   = this.charW * (1 - 2 * this.bktInX);
    const bh   = this.charH * (1 - this.bktTop);
    return { x: bx, y: by, w: bw, h: bh, cx, ct };
  }

  update(ts) {
    const W = this.engine.W, H = this.engine.H;

    // Level scaling
    this.level    = 1 + Math.floor(this.score / 10);
    this.spawnInt = Math.max(300, 700 - (this.level - 1) * 45);
    const spd     = 2.9 + (this.level - 1) * 0.38;

    // Combo reset after 2.2s
    if (ts - this.comboTs > 2200) this.combo = 0;
    if (this.shake > 0) this.shake--;

    // Spawn objects
    if (ts - this.lastSpawn > this.spawnInt) {
      const r    = 12 + Math.random() * 9;
      const rand = Math.random();
      // Most drops are argal images. Bombs start after the first few catches
      // so the player always sees argal_1.png ... argal_7.png first.
      const badChance = Math.min(0.18, 0.06 + this.level * 0.01);
      const type = (this.score > 2 && rand < badChance) ? 'bad'
                 : (this.level >= 3 && rand > 0.92 ? 'gold' : 'good');
      const imageKey = type === 'bad' ? null : `fallArgal${1 + Math.floor(Math.random() * 7)}`;
      this.objects.push({
        x: r + Math.random() * (W - r * 2),
        y: -20, r, type, imageKey,
        speed: spd + Math.random() * 1.8,
        rot: 0, trail: [],
      });
      this.lastSpawn = ts;
    }

    // Update basket
    const bkt = this._basket(W, H);

    // Update objects
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const o = this.objects[i];
      o.trail.push({ x: o.x, y: o.y });
      if (o.trail.length > 9) o.trail.shift();
      o.y += o.speed;
      o.rot += 0.07;

      // ── Basket collision (not full body) ────────────────
      const inX = o.x + o.r > bkt.x && o.x - o.r < bkt.x + bkt.w;
      const inY = o.y + o.r > bkt.y && o.y - o.r < bkt.y + bkt.h;

      if (inX && inY) {
        // HIT
        const col = o.type==='good' ? '#38a050' : o.type==='gold' ? '#c8880e' : '#cc3838';
        this._burst(o.x, o.y, col);

        if (o.type === 'bad') {
          this.combo = 0;
          this.lives = Math.max(0, this.lives - 1);
          this.shake = 14;
          this._float(o.x, o.y - 10, '💥 -❤️', '#cc3838');
        } else {
          this.combo++;
          this.comboTs = ts;
          const pts = o.type === 'gold' ? 5 : this.combo >= 3 ? 2 : 1;
          this.score += pts;
          const txt = o.type === 'gold'
            ? `+5 ✨`
            : this.combo >= 3 ? `+${pts} ×${this.combo}!` : `+${pts}`;
          this._float(o.x, o.y - 10, txt, col);
        }

        this.objects.splice(i, 1);
        this.engine.onScore(this.score);
        this.engine.onLives(this.lives);
        this.engine.onLevel(this.level);
        continue;
      }

      // Fell off bottom — penalise only good/gold misses
      if (o.y - o.r > H) {
        if (o.type !== 'bad') {
          this.combo = 0;
          this.lives = Math.max(0, this.lives - 1);
          this.shake = 8;
          this.engine.onLives(this.lives);
        }
        this.objects.splice(i, 1);
      }
    }

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.14; p.life--;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    // Update floats
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.y -= 1.2; f.life--;
      if (f.life <= 0) this.floats.splice(i, 1);
    }

    if (this.lives <= 0) this.engine.gameOver();
  }

  _burst(x, y, col) {
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * 2 * i / 12 + Math.random() * .3;
      this.particles.push({ x, y, vx: Math.cos(a) * (2 + Math.random()*3), vy: Math.sin(a) * (2 + Math.random()*3) - .5, life: 24, col });
    }
  }
  _float(x, y, txt, col) { this.floats.push({ x, y, txt, col, life: 48 }); }

  draw(ctx, W, H) {
    // ── Background — warm night sky ──────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#1c0e04');
    bgGrad.addColorStop(1, '#2e1a06');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Mongolian pattern stripes
    ctx.save();
    for (let xi = -H; xi < W + H; xi += 52) {
      ctx.beginPath(); ctx.moveTo(xi,0); ctx.lineTo(xi+H,H);
      ctx.strokeStyle = 'rgba(200,136,14,.035)'; ctx.lineWidth=16; ctx.stroke();
    }
    ctx.restore();

    // Stars
    for (let i = 0; i < 52; i++) {
      const sx = (i*79+11)%W, sy = (i*113+7)%(H*.72);
      const a = .06 + (i%4)*.04;
      ctx.beginPath(); ctx.arc(sx,sy,1,0,Math.PI*2);
      ctx.fillStyle = `rgba(240,184,48,${a})`; ctx.fill();
    }

    // Ground line
    const grd = ctx.createLinearGradient(0,0,W,0);
    grd.addColorStop(0,'rgba(200,136,14,0)');
    grd.addColorStop(.3,'rgba(200,136,14,.45)');
    grd.addColorStop(.7,'rgba(200,136,14,.45)');
    grd.addColorStop(1,'rgba(200,136,14,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, H-7, W, 2);

    // Shake offset
    const sx2 = this.shake > 0 ? (Math.random()-.5)*this.shake*1.4 : 0;
    const sy2 = this.shake > 0 ? (Math.random()-.5)*this.shake*.4 : 0;

    // ── Particles ────────────────────────────────────
    for (const p of this.particles) {
      const a = p.life / 24;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2);
      ctx.fillStyle = p.col + Math.floor(a*230).toString(16).padStart(2,'0');
      ctx.fill();
    }

    // ── Falling objects ──────────────────────────────
    for (const o of this.objects) {
      // Trail
      for (let ti = 1; ti < o.trail.length; ti++) {
        const pct = ti / o.trail.length;
        ctx.beginPath(); ctx.arc(o.trail[ti].x, o.trail[ti].y, o.r*.45*pct, 0, Math.PI*2);
        const tc = o.type==='bad' ? `rgba(204,56,56,${pct*.28})`
                 : o.type==='gold' ? `rgba(200,136,14,${pct*.35})`
                 : `rgba(56,160,80,${pct*.28})`;
        ctx.fillStyle = tc; ctx.fill();
      }

      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rot);

      if (o.type === 'good' || o.type === 'gold') {
        // Falling argal images: argal_1.png ... argal_7.png random
        const img = IMG[o.imageKey];
        const size = o.type === 'gold' ? o.r * 3.0 : o.r * 2.55;
        ctx.shadowBlur = o.type === 'gold' ? 16 : 9;
        ctx.shadowColor = o.type === 'gold' ? '#f0b030' : 'rgba(200,136,14,.7)';
        if (img && img.complete && img.naturalWidth) {
          ctx.drawImage(img, -size / 2, -size / 2, size, size);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, o.r, 0, Math.PI * 2);
          ctx.fillStyle = o.type === 'gold' ? '#c8880e' : '#8b5a2b';
          ctx.fill();
        }
        ctx.shadowBlur = 0;
        if (o.type === 'gold') {
          ctx.font = `bold ${Math.max(12, o.r)}px Nunito,sans-serif`;
          ctx.fillStyle = '#fff2b8';
          ctx.textAlign = 'center';
          ctx.fillText('+5', 0, -size * .42);
          ctx.textAlign = 'left';
        }
      } else {
        // Bomb
        ctx.beginPath(); ctx.arc(0,0,o.r,0,Math.PI*2);
        const bg = ctx.createRadialGradient(-o.r*.3,-o.r*.3,1,0,0,o.r);
        bg.addColorStop(0,'#ff6070'); bg.addColorStop(1,'#aa1020');
        ctx.fillStyle=bg; ctx.fill();
        ctx.beginPath(); ctx.moveTo(0,-o.r);
        ctx.quadraticCurveTo(o.r*.5,-o.r*1.4,o.r*.3,-o.r*1.8);
        ctx.strokeStyle='#8b6040'; ctx.lineWidth=2; ctx.stroke();
        ctx.beginPath(); ctx.arc(o.r*.3,-o.r*1.8,3,0,Math.PI*2);
        ctx.fillStyle='#f0b030'; ctx.shadowBlur=7; ctx.shadowColor='#f0b030'; ctx.fill(); ctx.shadowBlur=0;
      }
      ctx.restore();
    }

    // ── Argal mascot character (paddle) ──────────────
    const bkt = this._basket(W, H);
    ctx.save();
    ctx.translate(sx2, sy2);

    const argal = this.faceDir === 'right' ? IMG.argalRight : IMG.argalLeft;
    if (argal.complete && argal.naturalWidth) {
      const cl = bkt.cx - this.charW / 2;
      const ct = bkt.ct;

      // Subtle glow around character
      ctx.shadowBlur  = this.shake > 0 ? 28 : 16;
      ctx.shadowColor = this.shake > 0 ? 'rgba(204,56,56,.55)' : 'rgba(200,136,14,.35)';
      ctx.drawImage(argal, cl, ct, this.charW, this.charH);
      ctx.shadowBlur = 0;

      // Basket zone debug outline (subtle, only visible if uncomment for dev)
      // ctx.strokeStyle='rgba(56,160,80,.4)'; ctx.lineWidth=1;
      // ctx.setLineDash([3,3]); ctx.strokeRect(bkt.x,bkt.y,bkt.w,bkt.h); ctx.setLineDash([]);

    } else {
      // Fallback rect paddle
      ctx.fillStyle = '#b05828';
      ctx.beginPath(); ctx.roundRect(bkt.x, bkt.y, bkt.w, 14, 7); ctx.fill();
    }
    ctx.restore();

    // ── Float texts ──────────────────────────────────
    for (const f of this.floats) {
      const a = f.life / 48;
      ctx.font = `bold ${13 + Math.round((1-a)*3)}px Nunito,sans-serif`;
      ctx.fillStyle = f.col + Math.floor(a*240).toString(16).padStart(2,'0');
      ctx.textAlign = 'center';
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.textAlign = 'left';

    // ── HUD ──────────────────────────────────────────
    ctx.font = 'bold 13px monospace'; ctx.fillStyle = 'rgba(240,184,48,.75)';
    ctx.fillText(`LV ${this.level}`, 14, 26);
    if (this.combo >= 2) {
      ctx.fillStyle = '#c8880e';
      ctx.fillText(`COMBO ×${this.combo}`, 14, 46);
    }
    ctx.font = '11px Nunito,sans-serif'; ctx.fillStyle = 'rgba(240,184,48,.38)';
    ctx.fillText('аргал +1  том аргал +5  💣=амь хасна', W - 245, H - 12);
  }
}

/* ════════════════════════════════════════════════════════════
   DODGE GAME — Asteroid dodger
   ════════════════════════════════════════════════════════════ */
class DodgeGame {
  constructor(engine) { this.engine=engine; this.maxLives=3; this.reset(); }

  reset() {
    this.score=0; this.lives=this.maxLives; this.level=1;
    this.rocks=[]; this.px2=0.5; this.pR=18;
    this.lastSpawn=0; this.elapsed=0; this.lastTs=0;
    this.inv=0; this.particles=[]; this.scoreTimer=0;
    this.shields=0; this.shieldTimer=0; this.trail=[];
  }
  onPointerMove(x) { this.px2=x; }

  update(ts) {
    const W=this.engine.W, H=this.engine.H;
    const dt=this.lastTs ? Math.min(ts-this.lastTs,50) : 16;
    this.lastTs=ts; this.elapsed+=dt; this.scoreTimer+=dt; this.shieldTimer+=dt;
    this.level=1+Math.floor(this.elapsed/7000);
    const spawnInt=Math.max(240,700-this.level*50);
    const spd=2.8+this.level*.44;
    if(this.scoreTimer>400){ this.score++; this.scoreTimer=0; this.engine.onScore(this.score); this.engine.onLevel(this.level); }
    if(ts-this.lastSpawn>spawnInt){
      const r=13+Math.random()*20;
      this.rocks.push({x:r+Math.random()*(W-r*2),y:-r,r,speed:spd+Math.random()*2,rot:0,rs:(Math.random()-.5)*.12,hue:20+Math.random()*40});
      this.lastSpawn=ts;
    }
    if(this.shieldTimer>12000){
      this.rocks.push({x:60+Math.random()*(W-120),y:-20,r:13,speed:1.8,rot:0,rs:.04,type:'shield'});
      this.shieldTimer=0;
    }
    const px=this.px2*W, py=H-56;
    this.trail.push({x:px,y:py+this.pR*.5,life:12});
    if(this.trail.length>20) this.trail.shift();
    if(this.inv>0) this.inv-=dt;
    for(let i=this.rocks.length-1;i>=0;i--){
      const r2=this.rocks[i]; r2.y+=r2.speed; r2.rot+=r2.rs;
      const d=Math.hypot(r2.x-px,r2.y-py);
      if(r2.type==='shield'){
        if(d<r2.r+this.pR){ this.shields=Math.min(3,this.shields+1); this.rocks.splice(i,1); continue; }
      } else if(this.inv<=0&&d<r2.r+this.pR-5){
        if(this.shields>0){ this.shields--; this.inv=800; }
        else{
          this.lives=Math.max(0,this.lives-1); this.engine.onLives(this.lives); this.inv=1500;
          for(let p=0;p<14;p++){ const a=Math.PI*2*p/14; this.particles.push({x:px,y:py,vx:Math.cos(a)*(3+Math.random()*2),vy:Math.sin(a)*(3+Math.random()*2),life:26,col:'#cc3838'}); }
        }
        this.rocks.splice(i,1); continue;
      }
      if(r2.y-r2.r>H) this.rocks.splice(i,1);
    }
    for(let i=this.particles.length-1;i>=0;i--){ const p=this.particles[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=.15; p.life--; if(p.life<=0) this.particles.splice(i,1); }
    for(let i=this.trail.length-1;i>=0;i--){ this.trail[i].life--; if(this.trail[i].life<=0) this.trail.splice(i,1); }
    if(this.lives<=0) this.engine.gameOver();
  }

  draw(ctx,W,H) {
    ctx.fillStyle='#1c0e04'; ctx.fillRect(0,0,W,H);
    for(let x=0;x<W;x+=60){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.strokeStyle='rgba(200,136,14,.03)'; ctx.lineWidth=1; ctx.stroke(); }
    for(const t of this.trail){ const a=t.life/12; ctx.beginPath(); ctx.arc(t.x,t.y,4*a,0,Math.PI*2); ctx.fillStyle=`rgba(240,184,48,${a*.55})`; ctx.fill(); }
    for(const p of this.particles){ ctx.beginPath(); ctx.arc(p.x,p.y,3,0,Math.PI*2); ctx.fillStyle=p.col+Math.floor(p.life/26*200).toString(16).padStart(2,'0'); ctx.fill(); }
    for(const r2 of this.rocks){
      ctx.save(); ctx.translate(r2.x,r2.y); ctx.rotate(r2.rot);
      if(r2.type==='shield'){
        ctx.beginPath(); for(let a=0;a<6;a++){ const ang=a*Math.PI/3; a===0?ctx.moveTo(Math.cos(ang)*r2.r,Math.sin(ang)*r2.r):ctx.lineTo(Math.cos(ang)*r2.r,Math.sin(ang)*r2.r); } ctx.closePath();
        ctx.fillStyle='rgba(56,160,80,.18)'; ctx.fill(); ctx.strokeStyle='#38a050'; ctx.lineWidth=1.5; ctx.stroke();
        ctx.font='bold 11px sans-serif'; ctx.fillStyle='#38a050'; ctx.textAlign='center'; ctx.fillText('🛡',0,4); ctx.textAlign='left';
      } else {
        ctx.beginPath(); for(let a=0;a<7;a++){ const ang=a*Math.PI*2/7; const rad=r2.r*(a%2===0?.25:0)+r2.r*.75; a===0?ctx.moveTo(Math.cos(ang)*rad,Math.sin(ang)*rad):ctx.lineTo(Math.cos(ang)*rad,Math.sin(ang)*rad); } ctx.closePath();
        ctx.fillStyle=`hsl(${r2.hue},65%,55%)`; ctx.shadowBlur=8; ctx.shadowColor=`hsl(${r2.hue},65%,55%)`; ctx.fill(); ctx.shadowBlur=0;
      }
      ctx.restore();
    }
    const px=this.px2*W, py=H-56;
    const blink=this.inv>0&&Math.floor(this.inv/100)%2===0;
    if(!blink){
      ctx.save(); ctx.translate(px,py);
      if(this.shields>0){ ctx.beginPath(); ctx.arc(0,0,this.pR+8,0,Math.PI*2); ctx.strokeStyle='rgba(56,160,80,.45)'; ctx.lineWidth=2; ctx.setLineDash([4,4]); ctx.stroke(); ctx.setLineDash([]); }
      ctx.beginPath(); ctx.moveTo(0,-this.pR); ctx.lineTo(this.pR*.7,this.pR*.55); ctx.lineTo(-this.pR*.7,this.pR*.55); ctx.closePath();
      const g=ctx.createLinearGradient(0,-this.pR,0,this.pR); g.addColorStop(0,'#f0b030'); g.addColorStop(1,'#b05828');
      ctx.fillStyle=g; ctx.shadowBlur=16; ctx.shadowColor='#c8880e'; ctx.fill(); ctx.shadowBlur=0;
      ctx.beginPath(); ctx.arc(0,this.pR*.55,5,0,Math.PI*2); ctx.fillStyle='#c8880e'; ctx.shadowBlur=10; ctx.shadowColor='#f0b030'; ctx.fill(); ctx.shadowBlur=0;
      ctx.restore();
    }
    ctx.font='bold 13px monospace'; ctx.fillStyle='rgba(240,184,48,.7)';
    ctx.fillText(`${(this.elapsed/1000).toFixed(1)}s  LV${this.level}`,14,26);
    if(this.shields>0){ ctx.fillStyle='#38a050'; ctx.fillText(`🛡×${this.shields}`,14,44); }
  }
}

/* ════════════════════════════════════════════════════════════
   PAINT GAME — Finger painting
   ════════════════════════════════════════════════════════════ */
class PaintGame {
  constructor(engine){ this.engine=engine; this.maxLives=1; this.reset(); }
  reset(){
    this.score=0; this.lives=1; this.level=1; this.hue=30;
    this.path=[]; this.orbs=[]; this.lastSpawn=0; this.totalLen=0;
    this.bgC=null; this.clearBg=true;
    this.lpx=null; this.lpy=null;
  }
  onPointerMove(x,y){
    const W=this.engine.W, H=this.engine.H;
    const px=x*W, py=y*H;
    if(this.lpx!==null){
      const d=Math.hypot(px-this.lpx,py-this.lpy);
      if(d>2){
        this.hue=(this.hue+.8)%360; this.totalLen+=d;
        if(!this.bgC||this.bgC.width!==W){this.bgC=document.createElement('canvas');this.bgC.width=W;this.bgC.height=H;this.clearBg=true;}
        if(this.clearBg){const bc=this.bgC.getContext('2d');bc.fillStyle='#1c0e04';bc.fillRect(0,0,W,H);this.clearBg=false;}
        const bc=this.bgC.getContext('2d');
        bc.beginPath(); bc.moveTo(this.lpx,this.lpy); bc.lineTo(px,py);
        bc.strokeStyle=`hsla(${this.hue},85%,60%,.82)`; bc.lineWidth=5; bc.lineCap='round'; bc.lineJoin='round';
        bc.shadowBlur=12; bc.shadowColor=`hsl(${this.hue},85%,60%)`; bc.stroke(); bc.shadowBlur=0;
        this.score=Math.floor(this.totalLen/15); this.engine.onScore(this.score);
      }
    }
    this.lpx=px; this.lpy=py;
    this.path.push({x:px,y:py,hue:this.hue,ts:Date.now()});
    if(this.path.length>18) this.path.shift();
  }
  update(ts){
    const W=this.engine.W, H=this.engine.H;
    if(ts-this.lastSpawn>1500){
      this.orbs.push({x:40+Math.random()*(W-80),y:40+Math.random()*(H-80),r:14+Math.random()*8,hue:Math.random()*360,life:200,max:200});
      this.lastSpawn=ts; if(this.orbs.length>12) this.orbs.shift();
    }
    const px=(this.lpx||W/2), py=(this.lpy||H/2);
    for(let i=this.orbs.length-1;i>=0;i--){
      const o=this.orbs[i]; o.life--;
      if(Math.hypot(px-o.x,py-o.y)<o.r+12){
        const bc=this.bgC&&this.bgC.getContext('2d');
        if(bc){bc.beginPath();bc.arc(o.x,o.y,o.r*2.5,0,Math.PI*2);bc.fillStyle=`hsla(${o.hue},85%,60%,.35)`;bc.fill();}
        this.totalLen+=180; this.orbs.splice(i,1); continue;
      }
      if(o.life<=0) this.orbs.splice(i,1);
    }
  }
  draw(ctx,W,H){
    if(this.bgC) ctx.drawImage(this.bgC,0,0);
    else{ctx.fillStyle='#1c0e04';ctx.fillRect(0,0,W,H);}
    for(const o of this.orbs){
      const a=o.life/o.max, pulse=1+.15*Math.sin(Date.now()*.006);
      ctx.beginPath(); ctx.arc(o.x,o.y,o.r*pulse,0,Math.PI*2);
      ctx.strokeStyle=`hsla(${o.hue},85%,60%,${a})`; ctx.lineWidth=2.5; ctx.stroke();
      ctx.fillStyle=`hsla(${o.hue},85%,60%,${a*.15})`; ctx.fill();
    }
    for(let i=1;i<this.path.length;i++){
      const a2=this.path[i-1],b=this.path[i],age=i/this.path.length;
      ctx.beginPath(); ctx.moveTo(a2.x,a2.y); ctx.lineTo(b.x,b.y);
      ctx.strokeStyle=`hsla(${b.hue},85%,70%,${age*.55})`; ctx.lineWidth=2+age*4; ctx.lineCap='round';
      ctx.shadowBlur=10*age; ctx.shadowColor=`hsl(${b.hue},85%,65%)`; ctx.stroke(); ctx.shadowBlur=0;
    }
    const cx2=this.lpx||W/2, cy2=this.lpy||H/2;
    ctx.beginPath(); ctx.arc(cx2,cy2,9,0,Math.PI*2);
    ctx.fillStyle=`hsl(${this.hue},85%,65%)`; ctx.shadowBlur=16; ctx.shadowColor=`hsl(${this.hue},85%,60%)`; ctx.fill(); ctx.shadowBlur=0;
    ctx.font='12px Nunito,sans-serif'; ctx.fillStyle='rgba(240,184,48,.33)';
    ctx.fillText('Орбуудыг барь · Restart = цэвэрлэнэ',14,H-12);
  }
}

/* ════════════════════════════════════════════════════════════
   MEMORY GAME — Zone gesture sequence
   ════════════════════════════════════════════════════════════ */
class MemoryGame {
  constructor(engine){ this.engine=engine; this.maxLives=3; this.reset(); }
  reset(){
    this.score=0; this.lives=this.maxLives; this.level=1;
    this.seq=[]; this.inp=[];
    this.phase='show'; this.showIdx=0; this.showTs=0; this.showInt=750;
    this.waitTs=0; this.feedback=null; this.zoneHit=-1; this.lastX=0.5;
    this._addSeq();
  }
  onPointerMove(x){ this.lastX=x; }
  _addSeq(){
    let n; do{n=Math.floor(Math.random()*4);}while(this.seq.length&&n===this.seq[this.seq.length-1]);
    this.seq.push(n); this.phase='show'; this.showIdx=0; this.showTs=performance.now();
    this.inp=[]; this.zoneHit=-1; this.showInt=Math.max(380,750-(this.level-1)*38);
  }
  _zone(x){ return Math.min(3,Math.floor(x*4)); }
  update(ts){
    if(this.phase==='show'){
      if(ts-this.showTs>this.showInt){ this.showIdx++; this.showTs=ts; if(this.showIdx>=this.seq.length){ this.phase='input'; this.waitTs=ts; } }
    }
    if(this.phase==='input'){
      const z=this._zone(this.lastX);
      if(this.zoneHit!==z){
        const prev=this.zoneHit; this.zoneHit=z;
        if(prev!==-1&&prev!==z){
          const exp=this.seq[this.inp.length];
          this.feedback={zone:z,ok:z===exp,t:ts};
          if(z===exp){
            this.inp.push(z);
            if(this.inp.length===this.seq.length){ this.score+=this.seq.length*this.level; this.level++; this.engine.onScore(this.score); this.engine.onLevel(this.level); this.phase='wait'; this.waitTs=ts; }
          } else {
            this.lives=Math.max(0,this.lives-1); this.engine.onLives(this.lives);
            if(this.lives<=0){ this.engine.gameOver(); return; }
            this.phase='wait'; this.waitTs=ts;
          }
        }
      }
    }
    if(this.phase==='wait'&&ts-this.waitTs>1000) this._addSeq();
    if(this.feedback&&ts-this.feedback.t>480) this.feedback=null;
  }
  draw(ctx,W,H){
    ctx.fillStyle='#1c0e04'; ctx.fillRect(0,0,W,H);
    const cols=['#c8880e','#38a050','#cc3838','#2e6ab0'];
    const zW=W/4;
    for(let z=0;z<4;z++){
      const x=z*zW;
      const showing=this.phase==='show'&&this.showIdx<this.seq.length&&this.seq[this.showIdx]===z;
      const isNext=this.phase==='input'&&this.inp.length<this.seq.length&&this.seq[this.inp.length]===z;
      const isFb=this.feedback&&this.feedback.zone===z;
      let a=.05;
      if(showing) a=.52;
      else if(this._zone(this.lastX)===z&&this.phase==='input') a=.14;
      if(isFb) a = this.feedback.ok ? .6 : .42;
      const col=isFb&&!this.feedback.ok?`rgba(204,56,56,${a})`:cols[z]+Math.floor(a*255).toString(16).padStart(2,'0');
      ctx.fillStyle=col; ctx.fillRect(x+3,H*.18,zW-6,H*.64);
      ctx.strokeStyle=cols[z]+(showing?'bb':'28'); ctx.lineWidth=showing?2.5:.8;
      ctx.strokeRect(x+3,H*.18,zW-6,H*.64);
      ctx.font=`bold ${showing?50:34}px Nunito,sans-serif`; ctx.fillStyle=cols[z]+(showing?'ff':'55'); ctx.textAlign='center';
      ctx.fillText(String(z+1),x+zW/2,H*.47);
      if(isNext&&!isFb){ ctx.strokeStyle=cols[z]+'66'; ctx.lineWidth=1.5; ctx.setLineDash([5,4]); ctx.strokeRect(x+8,H*.22,zW-16,H*.56); ctx.setLineDash([]); }
      ctx.textAlign='left';
    }
    // Sequence dots
    const dotSp=20, start=W/2-this.seq.length*dotSp/2;
    for(let i=0;i<this.seq.length;i++){
      const cx2=start+i*dotSp, cy2=H*.1;
      const done=this.phase!=='show'&&i<this.inp.length;
      const act=this.phase==='show'&&i===this.showIdx-1;
      ctx.beginPath(); ctx.arc(cx2,cy2,6,0,Math.PI*2);
      ctx.fillStyle=done?cols[this.seq[i]]:act?'#fff':'rgba(255,255,255,.16)'; ctx.fill();
    }
    const lbl={show:'ХАРНА УУ…',input:'ДАВТ!',wait:'БЭЛТГЭЖ БАЙ…'};
    ctx.font='bold 16px Nunito,sans-serif'; ctx.fillStyle=this.phase==='input'?'#38a050':'rgba(240,184,48,.72)'; ctx.textAlign='center';
    ctx.fillText(lbl[this.phase]||'',W/2,H*.07);
    const cz=this._zone(this.lastX);
    ctx.fillStyle=cols[cz]+'bb'; ctx.beginPath(); ctx.roundRect(this.lastX*W-22,H*.9,44,7,3); ctx.fill();
    ctx.beginPath(); ctx.arc(this.lastX*W,H*.9+3,13,0,Math.PI*2);
    ctx.fillStyle=cols[cz]; ctx.shadowBlur=12; ctx.shadowColor=cols[cz]; ctx.fill(); ctx.shadowBlur=0;
    ctx.font='11px Nunito,sans-serif'; ctx.fillStyle='rgba(240,184,48,.3)';
    ctx.fillText('Гараа зүүн/баруун хөдөлгөж бүсийг солих',W/2,H-10);
    ctx.textAlign='left';
  }
}

export { GestureGameEngine };
