(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W, H;
  function syncWH(){ W = 1100; H = 600; }
  syncWH();

  // Handle high-DPI and resizing
  function resizeCanvas(){
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const baseW = 1100, baseH = 600;
    // keep internal resolution constant; CSS scales visually
    canvas.width = baseW * dpr;
    canvas.height = baseH * dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  const W0=W,H0=H;

  const UI = {
    time: document.getElementById('time'),
    score: document.getElementById('score'),
    fair: document.getElementById('fair'),
    risk: document.getElementById('risk'),
    nextReq: document.getElementById('nextReq'),
    startBtn: document.getElementById('start'),
    pauseBtn: document.getElementById('pause'),
    muteBtn: document.getElementById('mute'),
    mpMode: document.getElementById('mp_mode'),
    mpCreate: document.getElementById('mp_create'),
    mpJoin: document.getElementById('mp_join'),
    mpCode: document.getElementById('mp_code'),
    mpTeam: document.getElementById('mp_team'),
    mpStatus: document.getElementById('mp_status')
  };

  
  // Audio
  const BGM = document.getElementById('bgm');
  const SFX_START = document.getElementById('sfx_start');
  const SFX_WIN = document.getElementById('sfx_win');
  let muted = false;
  function playBgm(){ if (!muted){ BGM.volume = 0.35; BGM.play().catch(()=>{}); } }
  function stopBgm(){ BGM.pause(); BGM.currentTime = 0; }
  function playStart(){ if(!muted) SFX_START.currentTime=0, SFX_START.play().catch(()=>{}); }
  function playWin(){ if(!muted) SFX_WIN.currentTime=0, SFX_WIN.play().catch(()=>{}); }
const LANES = 3;
  const LANE_X = [220, 550, 880];
  const LANE_COLORS = ['#5b8ef1','#6dd3a0','#f2c94c'];
  const QUEUES = [[],[],[]];
  const LANE_LABELS = ['Lane 1 (A)','Lane 2 (S)','Lane 3 (D)'];

  let game, seq, nextRequired, tLeft, score, fairness, risk, paused, running, lastSpawn, spawnMs, power, powerTimer, combo, mistakes;

  function reset(){ stopBgm(); playBgm(); 
    for (let i=0;i<LANES;i++) QUEUES[i]=[];
    seq = 1; nextRequired = 1;
    tLeft = 90; score = 0; fairness = 1.0; risk = 0.0; paused = false; running = false;
    lastSpawn = 0; spawnMs = 750; power = 0; powerTimer = 0; combo = 0; mistakes = 0;
    updateUI();
  }

  function updateUI() {
    UI.time.textContent = Math.max(0, Math.floor(tLeft));
    UI.score.textContent = Math.floor(score);
    UI.fair.textContent = Math.max(0, Math.round(fairness*100)) + '%';
    UI.risk.textContent = Math.min(100, Math.round(risk*100)) + '%';
    UI.nextReq.textContent = nextRequired;
  }

  function spawnOrder(ts) {
    const lane = Math.floor(Math.random()*LANES);
    const typeRand = Math.random();
    const order = {
      id: seq++,
      lane,
      y: 90 + Math.random()*40,
      type: typeRand < 0.1 ? 'private' : (typeRand > 0.92 ? 'bribe' : 'public'),
      created: ts
    };
    QUEUES[lane].push(order);
  }

  function drawBackground(){ ctx.save(); ctx.shadowBlur=18; ctx.shadowColor='rgba(255,209,102,0.6)'; 
    ctx.clearRect(0,0,1100,600);
    // headers
    ctx.fillStyle = '#e6e8eb';
    ctx.font = '700 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Next Global Sequence → ' + nextRequired, W/2, 36);
    ctx.font = '600 12px Inter, sans-serif';
    ctx.fillStyle = '#9aa3ad';
    ctx.fillText('Serve in exact arrival order for max fairness and score', W/2, 56);

    // lanes
    for (let i=0;i<LANES;i++) {
      ctx.strokeStyle = '#1f232b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(LANE_X[i], 80);
      ctx.lineTo(LANE_X[i], H-140);
      ctx.stroke();

      ctx.fillStyle = LANE_COLORS[i];
      ctx.globalAlpha = 0.08;
      ctx.fillRect(LANE_X[i]-120, 70, 240, H-180);
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#9aa3ad';
      ctx.textAlign = 'center';
      ctx.fillText(LANE_LABELS[i], LANE_X[i], H-150);

      // cup
      ctx.fillStyle = '#c47a3d';
      ctx.beginPath();
      const cx = LANE_X[i], cy = H-110;
      ctx.moveTo(cx-36, cy-30);
      ctx.lineTo(cx+36, cy-30);
      ctx.lineTo(cx+28, cy+20);
      ctx.lineTo(cx-28, cy+20);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#2a2f38';
      ctx.fillRect(cx-30, cy-18, 60, 10);
    }

    // meters
    // power bar
    ctx.fillStyle = '#9aa3ad';
    ctx.fillText('Shared Sequencer (SPACE)', W/2, H-60);
    ctx.strokeStyle = '#1f232b'; ctx.lineWidth=2;
    ctx.strokeRect(W/2-200, H-48, 400, 12);
    ctx.fillStyle = '#6dd3a0';
    let p = Math.max(0, Math.min(1, power/100));
    ctx.fillRect(W/2-200, H-48, 400*p, 12);
    if (powerTimer>0) {
      ctx.globalAlpha=0.15; ctx.fillStyle = '#6dd3a0'; ctx.fillRect(0,0,W,H); ctx.globalAlpha=1;
      ctx.fillStyle='#6dd3a0'; ctx.fillText('Power Active: auto-correct ON', W/2, H-70);
    }

    // risk meter
    ctx.fillStyle = '#9aa3ad';
    ctx.textAlign='left';
    ctx.fillText('Risk', 20, 36);
    ctx.strokeStyle = '#1f232b'; ctx.lineWidth=2;
    ctx.strokeRect(20, 44, 160, 10);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(20, 44, 160*Math.min(1,risk), 10);

    // fairness
    ctx.textAlign='right';
    ctx.fillStyle = '#9aa3ad';
    ctx.fillText('Fairness', W-20, 36);
    ctx.strokeStyle = '#1f232b'; ctx.lineWidth=2;
    ctx.strokeRect(W-180, 44, 160, 10);
    ctx.fillStyle = '#5b8ef1';
    ctx.fillRect(W-180, 44, 160*Math.max(0,Math.min(1,fairness)), 10);
  }

  function drawQueues(ts) {
    for (let i=0;i<LANES;i++){
      const q = QUEUES[i];
      let y = 100;
      for (let j=0;j<q.length;j++){
        const o = q[j];
        // bean
        const base = o.type==='private' ? '#8a7af1' : (o.type==='bribe' ? '#ff9f43' : '#c47a3d');
        ctx.fillStyle = base;
        ctx.beginPath();
        ctx.ellipse(LANE_X[i], y, 28, 20, 0, 0, Math.PI*2);
        ctx.fill();

        // icon
        ctx.font='700 12px Inter, sans-serif';
        ctx.textAlign='center';
        ctx.fillStyle='#0b0c0e';
        const icon = o.type==='private' ? '🔒' : (o.type==='bribe' ? '💰' : '☕');
        ctx.fillText(icon, LANE_X[i], y+4);

        // id
        ctx.font='800 12px Inter, sans-serif';
        ctx.fillStyle='#0b0c0e';
        ctx.fillText('#'+o.id, LANE_X[i], y-14);

        y += 54;
      }
    }
  }

  function processLane(i){
    const q = QUEUES[i];
    if (!q.length) return feedback('empty');
    const o = q[0];

    let correct = (o.id === nextRequired);
    let isPrivate = o.type==='private';
    let isBribe = o.type==='bribe';

    if (powerTimer>0 && isPrivate) correct = true; // Private orders OK under power

    if (correct){
      q.shift();
      nextRequired++;
      combo = Math.min(10, combo+1);
      const base = 10;
      const bonus = 2*combo;
      score += base + bonus; if(channel) channel.postMessage({type:'score', team, score});
      fairness = Math.min(1, fairness + 0.02);
      power = Math.min(100, power + 6);
      feedback('good');
    } else {
      // served out of order
      q.shift();
      const penalty = 8;
      score = Math.max(0, score - penalty);
      fairness = Math.max(0, fairness - 0.08);
      mistakes++;
      feedback('bad');
      if (isBribe){
        risk = Math.min(1, risk + 0.18);
        score += 14; if(channel) channel.postMessage({type:'score', team, score}); // the "temptation" reward
      } else {
        risk = Math.min(1, risk + 0.06);
      }
      combo = 0;
    }
  }

  function feedback(kind){
    // simple flash
    if (kind==='good'){
      flash( '#6dd3a0', 120 );
    } else if (kind==='bad'){
      flash( '#ff6b6b', 160 );
    } else {
      flash( '#9aa3ad', 80 );
    }
  }
  let flashUntil=0, flashColor='#ffffff';
  function flash(color, ms){
    flashUntil = performance.now()+ms;
    flashColor = color;
  }

  function drawFlash(ts){
    if (ts < flashUntil){
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = flashColor;
      ctx.fillRect(0,0,W,H);
      ctx.globalAlpha = 1;
    }
  }

  function step(ts){
    if (!running || paused) {
      drawBackground(); drawQueues(ts); drawFlash(ts);
      requestAnimationFrame(step);
      return;
    }

    const dt = 1/60;
    tLeft -= dt;
    updateUI();

    if (tLeft <= 0 || risk >= 1){
      running = false;
      showGameOver();
      drawBackground(); drawQueues(ts); drawFlash(ts);
      return;
    }

    if (!lastSpawn) lastSpawn = ts;
    if (ts - lastSpawn > spawnMs){
      spawnOrder(ts);
      lastSpawn = ts;
      // slight acceleration
      spawnMs = Math.max(420, spawnMs - 1.2);
    }

    if (powerTimer>0){
      powerTimer -= dt;
      if (powerTimer<=0) powerTimer = 0;
      // slight UI pulse handled in drawBackground overlay
    }

    drawBackground();
    drawQueues(ts);
    drawFlash(ts);
    requestAnimationFrame(step);
  }

  function showGameOver(){
    const msg = risk >= 1 ? 'Sequencer Captured! Too much Risk.' : 'Time!';
    const share = `I scored ${Math.floor(score)} with ${Math.max(0,Math.round(fairness*100))}% fairness in Espresso Sequencer ☕⚖️`;
    // overlay
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(0,0,W,H);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#e6e8eb';
    ctx.textAlign='center';
    ctx.font='800 36px Inter, sans-serif';
    playWin(); ctx.fillText('Game Over', W/2, H/2 - 40);
    ctx.font='600 20px Inter, sans-serif';
    ctx.fillText(msg, W/2, H/2 - 8);
    ctx.fillText('Score: ' + Math.floor(score) + '   •   Fairness: ' + Math.max(0,Math.round(fairness*100)) + '%', W/2, H/2 + 24);
    ctx.font='600 16px Inter, sans-serif';
    ctx.fillText('Press Start to play again', W/2, H/2 + 56);
    // show shareable text in console for quick copy
    console.log(share);
  }

  // Controls
  window.addEventListener('keydown', (e) => {
    if (!running || paused) return;
    if (e.repeat) return;
    if (e.key.toLowerCase()==='a') processLane(0);
    if (e.key.toLowerCase()==='s') processLane(1);
    if (e.key.toLowerCase()==='d') processLane(2);
    if (e.code==='Space') {
      if (power>=100 && powerTimer<=0){
        powerTimer = 5.0;
        power = 0;
        // while active, auto-correct: when user presses any lane, corrects id silently
        // (implemented by letting private orders be always correct during power; plus we
        // soft-nudge fairness up in correct handler)
        flash('#6dd3a0', 250);
      }
      e.preventDefault();
    }
  }, {passive:false});

  UI.startBtn.addEventListener('click', () => { playStart();
    reset(); running = true; requestAnimationFrame(step);
  });
  UI.pauseBtn.addEventListener('click', () => { paused = !paused; UI.pauseBtn.textContent = paused? 'Resume':'Pause'; });

  // Click/touch support (tap cups)
  canvas.addEventListener('click', (e) => {
    if (!running || paused) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    // choose nearest lane
    const idx = LANE_X.map(cx => Math.abs(cx - (x * (W/rect.width)))).indexOf(Math.min(...LANE_X.map(cx => Math.abs(cx - (x * (W/rect.width))))));
    processLane(idx);
  });

  reset();
  requestAnimationFrame(step);
    ctx.restore();

})();
  // Mute toggle
  UI.muteBtn.addEventListener('click', ()=>{
    muted = !muted;
    if (muted) { BGM.pause(); UI.muteBtn.textContent='🔇 Unmute'; }
    else { playBgm(); UI.muteBtn.textContent='🔊 Mute'; }
  });


  // Multiplayer (local same-browser tabs) via BroadcastChannel
  let roomCode = null;
  let channel = null;
  let team = 'A';
  let mode = '1v1';
  let teamScores = {A:0,B:0,C:0};

  function openChannel(){
    if (channel) channel.close();
    channel = new BroadcastChannel('espresso_game_' + roomCode);
    channel.onmessage = (ev)=>{
      const msg = ev.data || {};
      if (msg.type==='hello'){ channel.postMessage({type:'welcome', mode, team}); }
      if (msg.type==='start'){ if (!running){ UI.startBtn.click(); } }
      if (msg.type==='score'){ teamScores[msg.team] = msg.score; updateMpStatus(); }
      if (msg.type==='mode'){ mode = msg.mode; UI.mpMode.value = mode; }
    };
    channel.postMessage({type:'hello'});
    updateMpStatus();
  }

  function updateMpStatus(){
    const entries = Object.entries(teamScores).filter(([k,v])=>v>0).map(([k,v])=>k+': '+v).join(' | ');
    UI.mpStatus.textContent = roomCode? ('Room '+roomCode+' • '+mode+' • '+(entries||'no scores yet')) : 'Not connected';
  }

  function genCode(){ const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c=''; for(let i=0;i<6;i++) c+=chars[Math.floor(Math.random()*chars.length)]; return c; }

  UI.mpCreate.addEventListener('click', ()=>{
    roomCode = genCode();
    UI.mpCode.value = roomCode;
    openChannel();
  });
  UI.mpJoin.addEventListener('click', ()=>{
    roomCode = (UI.mpCode.value||'').trim().toUpperCase();
    if (!roomCode) return;
    openChannel();
  });
  UI.mpMode.addEventListener('change', ()=>{
    mode = UI.mpMode.value;
    if (channel) channel.postMessage({type:'mode', mode});
  });
  UI.mpTeam.addEventListener('change', ()=>{ team = UI.mpTeam.value; });

  // Broadcast start and score changes
  const origStart = UI.startBtn.onclick;
  UI.startBtn.addEventListener('click', ()=>{ if (channel) channel.postMessage({type:'start'}); });
  // Hook score updates: wrap place where score is updated
