(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const q = 1.602176634e-19;
  const h = 6.62607015e-34;
  const c = 299792458;
  const defaults = { size: 100, current: 0, injection: 100, srv: 2, abulk: 6, bscale: 5, cscale: 0.1, lee: 80, wavelength: 450, substrate: 430, mesa: 80, angle: 85, nucleation: 30, buffer: 800, nlayer: 1800, ndoping: 19, esl: 30, spacer: 200, srl: 3, barrier: 5, well: 1, wells: 1, indium: 15, ebl: 20, aluminum: 5, player: 60, pdoping: 18.5, pcontact: 15, tco: 100, itoRs: 20, metal: 300, alumina: 30, sio2: 300, damage: 200 };
  const sliders = Object.keys(defaults);
  let state = null;

  function read() {
    const layers = Object.fromEntries(['substrate', 'mesa', 'angle', 'nucleation', 'buffer', 'nlayer', 'ndoping', 'esl', 'spacer', 'srl', 'barrier', 'well', 'wells', 'indium', 'ebl', 'aluminum', 'player', 'pdoping', 'pcontact', 'tco', 'itoRs', 'metal', 'alumina', 'sio2', 'damage'].map((id) => [id, Number($(id).value)]));
    return {
      sizeUm: Number($('size').value),
      currentDensity: Math.pow(10, Number($('current').value) / 100 * 4 - 1),
      injection: Number($('injection').value) / 100,
      srv: Math.pow(10, Number($('srv').value)),
      aBulk: Math.pow(10, Number($('abulk').value)),
      b: Number($('bscale').value) * 1e-11,
      auger: Number($('cscale').value) * 1e-30,
      lee: Number($('lee').value) / 100,
      wavelengthNm: Number($('wavelength').value),
      activeNm: layers.wells * (layers.well + layers.barrier),
      layers,
    };
  }

  // Solve G = A*n + B*n² + C*n³ for the positive steady-state carrier density.
  function carrierDensity(generation, a, b, auger) {
    const rate = (n) => a * n + b * n * n + auger * n * n * n;
    let low = 0, high = Math.max(1, generation / Math.max(a, 1));
    while (rate(high) < generation && high < 1e22) high *= 2;
    for (let i = 0; i < 90; i++) {
      const mid = (low + high) / 2;
      if (rate(mid) < generation) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  }

  function calculate(p, currentDensity) {
    const widthCm = p.sizeUm * 1e-4;
    const activeCm = p.activeNm * 1e-7;
    const sidewallA = p.srv * 4 / widthCm;
    const aEff = p.aBulk + sidewallA;
    const generation = currentDensity * p.injection / (q * activeCm);
    const n = carrierDensity(generation, aEff, p.b, p.auger);
    const radiative = p.b * n * n;
    const bulkLoss = p.aBulk * n;
    const surfaceLoss = sidewallA * n;
    const augerLoss = p.auger * n * n * n;
    const total = radiative + bulkLoss + surfaceLoss + augerLoss;
    const iqe = total > 0 ? radiative / total : 0;
    const eqe = p.injection * iqe * p.lee;
    return { n, iqe, eqe, sidewallA, surfaceShare: total > 0 ? surfaceLoss / total : 0 };
  }

  function prettyRate(v) {
    if (!Number.isFinite(v) || v <= 0) return '0';
    const units = [[1e15, 'P'], [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k']];
    for (const [scale, unit] of units) if (v >= scale) return (v / scale).toPrecision(3) + ' ' + unit;
    return v.toPrecision(3);
  }

  function prettyPower(watts) {
    if (watts >= 1) return (watts).toPrecision(3) + ' W';
    if (watts >= 1e-3) return (watts * 1e3).toPrecision(3) + ' mW';
    if (watts >= 1e-6) return (watts * 1e6).toPrecision(3) + ' μW';
    return (watts * 1e9).toPrecision(3) + ' nW';
  }

  function prettyCurrent(amps) {
    if (amps >= 1) return amps.toPrecision(3) + ' A';
    if (amps >= 1e-3) return (amps * 1e3).toPrecision(3) + ' mA';
    if (amps >= 1e-6) return (amps * 1e6).toPrecision(3) + ' μA';
    return (amps * 1e9).toPrecision(3) + ' nA';
  }

  function updateOutputs(p, result) {
    const widthCm = p.sizeUm * 1e-4;
    const areaCm2 = widthCm * widthCm;
    const current = p.currentDensity * areaCm2;
    const photonRate = current / q * result.eqe;
    const photonEnergy = h * c / (p.wavelengthNm * 1e-9);
    const power = photonRate * photonEnergy;

    $('size-out').textContent = `${p.sizeUm} μm`;
    $('current-out').textContent = `${p.currentDensity.toPrecision(3)} A/cm²`;
    $('injection-out').textContent = `${(p.injection * 100).toFixed(0)}%`;
    $('srv-out').textContent = `${prettyRate(p.srv)} cm/s`;
    $('abulk-out').textContent = `${prettyRate(p.aBulk)} s⁻¹`;
    $('bscale-out').textContent = `${Number($('bscale').value).toFixed(1)} × 10⁻¹¹`;
    $('cscale-out').textContent = `${Number($('cscale').value).toFixed(1)} × 10⁻³⁰`;
    $('lee-out').textContent = `${(p.lee * 100).toFixed(0)}%`;
    $('wavelength-out').textContent = `${p.wavelengthNm} nm`;
    $('active-out').textContent = `${p.activeNm} nm (MQW 합계)`;
    Object.entries(p.layers).forEach(([id, value]) => {
      const unit = ['srl', 'wells'].includes(id) ? '주기' : id === 'mesa' || id === 'indium' || id === 'aluminum' ? '%' : id === 'angle' ? '°' : ['ndoping', 'pdoping'].includes(id) ? 'log₁₀ cm⁻³' : id === 'itoRs' ? 'Ω/sq' : 'nm';
      $(`${id}-out`).textContent = `${value} ${unit}`;
    });

    $('eqe-value').textContent = `${(result.eqe * 100).toFixed(2)}%`;
    $('iqe-value').textContent = `${(result.iqe * 100).toFixed(1)}%`;
    $('photon-value').textContent = prettyRate(photonRate);
    $('power-value').textContent = prettyPower(power);
    $('current-value').textContent = `${prettyCurrent(current)} · ${p.wavelengthNm} nm`;
    $('surface-loss').textContent = `전체 재결합 중 측벽 몫 ${(result.surfaceShare * 100).toFixed(1)}%`;
    $('size-label').textContent = `${p.sizeUm} μm`;
    updateStructure(p);
    state = { p, result };
  }

  function wavelengthColor(nm) {
    let r = 0, g = 0, b = 0;
    if (nm < 440) { r = nm < 420 ? 0.3 * (nm - 380) / 40 : (440 - nm) / 60; b = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
    else { r = 1; }
    const factor = nm < 420 ? 0.3 + 0.7 * (nm - 380) / 40 : nm > 700 ? 0.3 + 0.7 * (750 - nm) / 50 : 1;
    const channel = (v) => Math.round(255 * Math.pow(Math.max(0, v * factor), 0.8));
    const hex = (v) => channel(v).toString(16).padStart(2, '0');
    const colorName = nm < 450 ? '보라' : nm < 495 ? '청색' : nm < 520 ? '청록' : nm < 565 ? '녹색' : nm < 590 ? '황록' : nm < 625 ? '주황' : '적색';
    return { color: `#${hex(r)}${hex(g)}${hex(b)}`, name: colorName };
  }

  function updateStructure(p) {
    const { sizeUm, layers, wavelengthNm } = p;
    const emissionColor = wavelengthColor(wavelengthNm).color;
    const fullW = 440, fullL = 280, fullR = fullL + fullW, mesaW = fullW * layers.mesa / 100;
    const mesaL = 500 - mesaW / 2, mesaR = 500 + mesaW / 2, bottom = 385;
    const H = {
      substrate: 30 + (layers.substrate - 50) / 950 * 16, nucleation: 5 + (layers.nucleation - 10) / 90 * 4,
      buffer: 14 + (layers.buffer - 300) / 1700 * 12, nlayer: 28 + (layers.nlayer - 100) / 2900 * 30,
      esl: layers.esl ? 5 + layers.esl / 100 * 5 : 0, spacer: layers.spacer ? 6 + layers.spacer / 300 * 9 : 0,
      srl: layers.srl ? 5 + layers.srl * 2.2 : 0, mqw: layers.wells * (2.1 + (layers.well + layers.barrier) / 30 * 2.2),
      ebl: 6 + (layers.ebl - 5) / 45 * 7, player: 20 + (layers.player - 40) / 260 * 18,
      pcontact: 5 + layers.pcontact / 50 * 5, tco: 8 + (layers.tco - 20) / 280 * 9, metal: 7 + (layers.metal - 50) / 450 * 7,
    };
    const topY = bottom - Object.values(H).reduce((sum, height) => sum + height, 0);
    const nSurface = bottom - H.substrate - H.nucleation - H.buffer - H.nlayer;
    const sideShift = (90 - layers.angle) / 20 * 14;
    let y = bottom;
    const pos = {}, shapes = [], notes = [];
    function add(key, title, detail, color, width = mesaW, x = 500 - width / 2, side = 'left') {
      const hh = H[key]; if (!hh) return;
      y -= hh; pos[key] = { y, h: hh, x, w: width };
      const clip = width === mesaW && ['esl', 'spacer', 'srl', 'ebl', 'player', 'pcontact', 'tco'].includes(key) ? ' clip-path="url(#mesa-clip)"' : '';
      shapes.push(`<rect x="${x}" y="${y}" width="${width}" height="${hh}" fill="${color}" stroke="#fff" stroke-width="1"${clip}/>`);
      notes.push({ title, detail, color, cy: y + hh / 2, side, key });
    }
    add('substrate', '패턴 사파이어 기판', `${layers.substrate} nm`, '#dfe6ec', fullW, fullL, 'left');
    shapes.push(`<path d="M${fullL} ${pos.substrate.y}l10-8 10 8 10-8 10 8 10-8 10 8h${fullW - 60}" fill="#c5d4df" stroke="#aebfca"/>`);
    add('nucleation', '저온 핵생성층', `AlN/GaN · ${layers.nucleation} nm`, '#bdc6d4', fullW, fullL, 'left');
    add('buffer', 'UID-GaN 버퍼·템플릿', `${layers.buffer} nm`, '#a9c9e5', fullW, fullL, 'left');
    add('nlayer', 'n-GaN:Si 접촉층', `${layers.nlayer} nm · 1e${layers.ndoping} cm⁻³`, '#7eafe2', fullW, fullL, 'left');
    add('esl', 'n-AlGaN 전자 확산층', `${layers.esl} nm`, '#8ec9d1', mesaW, undefined, 'left');
    add('spacer', 'n-GaN 스페이서', `${layers.spacer} nm`, '#9ac7e9', mesaW, undefined, 'left');
    add('srl', 'InGaN/GaN 응력 완화 초격자', `${layers.srl} periods`, '#b8a8dc', mesaW, undefined, 'left');
    if (H.srl) for (let i = 1; i < layers.srl; i++) shapes.push(`<path d="M${mesaL} ${pos.srl.y + i * H.srl / layers.srl}h${mesaW}" stroke="#f6f2ff"/>`);
    y -= H.mqw; pos.mqw = { y, h: H.mqw, x: mesaL, w: mesaW };
    for (let i = 0; i < layers.wells; i++) {
      const ph = H.mqw / layers.wells, py = y + i * ph;
      shapes.push(`<rect x="${mesaL}" y="${py}" width="${mesaW}" height="${ph * .48}" fill="${emissionColor}" stroke="#fff4dd" stroke-width="1" clip-path="url(#mesa-clip)"/><rect x="${mesaL}" y="${py + ph * .48}" width="${mesaW}" height="${ph * .52}" fill="#c7d9ef" stroke="#fff" stroke-width=".7" clip-path="url(#mesa-clip)"/>`);
    }
    notes.push({ title: 'InGaN/GaN 다중양자우물', detail: `In ${layers.indium}% · ${layers.wells} × (${layers.well}/${layers.barrier} nm)`, color: '#f0ad45', cy: y + H.mqw / 2, side: 'right', key: 'mqw' });
    add('ebl', 'p-AlGaN 전자 차단층', `${layers.ebl} nm · Al ${layers.aluminum}%`, '#d89fbd', mesaW, undefined, 'right');
    add('player', 'p-GaN:Mg 정공 주입층', `${layers.player} nm · 1e${layers.pdoping} cm⁻³`, '#9bd7ca', mesaW, undefined, 'right');
    add('pcontact', 'p++-GaN 접촉층', `${layers.pcontact} nm`, '#67bca9', mesaW, undefined, 'right');
    add('tco', 'ITO 투명 전류 확산층', `${layers.tco} nm · ${layers.itoRs} Ω/sq`, '#63949a', mesaW, undefined, 'right');
    add('metal', 'p-금속 전극', `Ti/Al/Ni/Au · ${layers.metal} nm`, '#d6b752', mesaW * .58, 500 - mesaW * .29, 'right');
    const mqw = pos.mqw;
    const damageW = 3 + layers.damage / 1500 * 11, aluminaW = 3 + layers.alumina / 60 * 6, sio2W = 4 + layers.sio2 / 500 * 8;
    const damageY = mqw.y - 8, damageH = mqw.h + 16;
    const sidewallH = nSurface - topY;
    const fracAtMqw = Math.max(0, Math.min(1, (mqw.y + mqw.h / 2 - topY) / sidewallH));
    const leftWall = mesaL + sideShift * fracAtMqw, rightWall = mesaR - sideShift * fracAtMqw;
    const leftAlumina = `M${mesaL - damageW - aluminaW} ${topY}L${mesaL - damageW} ${topY}L${mesaL + sideShift - damageW} ${nSurface}L${mesaL + sideShift - damageW - aluminaW} ${nSurface}Z`;
    const leftSio2 = `M${mesaL - damageW - aluminaW - sio2W} ${topY}L${mesaL - damageW - aluminaW} ${topY}L${mesaL + sideShift - damageW - aluminaW} ${nSurface}L${mesaL + sideShift - damageW - aluminaW - sio2W} ${nSurface}Z`;
    const rightAlumina = `M${mesaR + damageW} ${topY}L${mesaR + damageW + aluminaW} ${topY}L${mesaR - sideShift + damageW + aluminaW} ${nSurface}L${mesaR - sideShift + damageW} ${nSurface}Z`;
    const rightSio2 = `M${mesaR + damageW + aluminaW} ${topY}L${mesaR + damageW + aluminaW + sio2W} ${topY}L${mesaR - sideShift + damageW + aluminaW + sio2W} ${nSurface}L${mesaR - sideShift + damageW + aluminaW} ${nSurface}Z`;
    const side = `<rect x="${leftWall}" y="${damageY}" width="${damageW}" height="${damageH}" fill="url(#damage-pattern)" stroke="#c94b4b"/><rect x="${rightWall - damageW}" y="${damageY}" width="${damageW}" height="${damageH}" fill="url(#damage-pattern)" stroke="#c94b4b"/><path d="${leftAlumina}" fill="#8c79cf" stroke="#fff"/><path d="${leftSio2}" fill="#b5a8e8" stroke="#fff"/><path d="${rightAlumina}" fill="#8c79cf" stroke="#fff"/><path d="${rightSio2}" fill="#b5a8e8" stroke="#fff"/><rect x="${fullR - 46}" y="${pos.nlayer.y - 10}" width="38" height="10" rx="2" fill="#d6b752"/>`;
    const clipDefs = `<defs><clipPath id="mesa-clip"><path d="M${mesaL} ${topY}L${mesaR} ${topY}L${mesaR - sideShift} ${nSurface}L${mesaL + sideShift} ${nSurface}Z"/></clipPath></defs>`;
    $('device-layers').innerHTML = clipDefs + shapes.join('') + `<text x="500" y="${pos.substrate.y + H.substrate / 2 + 4}" text-anchor="middle" class="svg-layer-inside">Sapphire</text><text x="${fullR - 27}" y="${pos.nlayer.y - 14}" text-anchor="middle" class="svg-layer-small">n-pad</text>`;
    $('sidewall-structure').innerHTML = side;
    notes.push({ title: 'ICP 식각 손상대', detail: `${layers.damage} nm · MQW 측벽`, color: '#c94b4b', cy: mqw.y + mqw.h / 2, side: 'right', key: 'damage' });
    notes.push({ title: 'ALD Al₂O₃ 계면 패시베이션', detail: `${layers.alumina} nm`, color: '#8c79cf', cy: topY + sidewallH * .42, side: 'right', key: 'alumina' });
    notes.push({ title: 'PECVD SiO₂ 절연 오버코트', detail: `${layers.sio2} nm`, color: '#b5a8e8', cy: topY + sidewallH * .66, side: 'right', key: 'sio2' });
    notes.push({ title: 'n-금속 접촉 패드', detail: '메사 노출 n-GaN', color: '#d6b752', cy: pos.nlayer.y - 5, side: 'left', key: 'npad' });
    notes.push({ title: '메사 식각 프로파일', detail: `${layers.angle}° 측벽 · 폭 ${layers.mesa}%`, color: '#56616b', cy: topY + sidewallH * .82, side: 'right', key: 'profile' });
    function drawNotes(sideName) {
      const items = notes.filter((n) => n.side === sideName).sort((a, b) => a.cy - b.cy);
      const tx = sideName === 'left' ? 18 : 755, lx = sideName === 'left' ? 255 : 735;
      const slots = items.map((_, i) => 52 + i * (340 / Math.max(1, items.length - 1)));
      return items.map((item, i) => {
        const edge = sideName === 'left' ? (item.key === 'substrate' || item.key === 'nucleation' || item.key === 'buffer' || item.key === 'nlayer' ? fullL : mesaL) : (['damage', 'alumina', 'sio2'].includes(item.key) ? mesaR + damageW + aluminaW : mesaR);
        const elbow = sideName === 'left' ? Math.min(lx, edge - 8) : Math.max(lx, edge + 8);
        return `<path d="M${edge} ${item.cy}H${elbow}L${sideName === 'left' ? 246 : 746} ${slots[i]}" fill="none" stroke="${item.color}" stroke-width="1.1"/><circle cx="${edge}" cy="${item.cy}" r="2.2" fill="${item.color}"/><text x="${tx}" y="${slots[i] - 2}" class="svg-callout-title">${item.title}</text><text x="${tx}" y="${slots[i] + 12}" class="svg-callout-detail">${item.detail}</text>`;
      }).join('');
    }
    $('device-callouts').innerHTML = drawNotes('left') + drawNotes('right');
    const glow = wavelengthColor(wavelengthNm);
    $('photon-arrows').setAttribute('stroke', glow.color);
    $('wavelength-swatch').style.backgroundColor = glow.color;
    $('wavelength-swatch').style.boxShadow = `0 0 14px ${glow.color}`;
    $('active-swatch').style.backgroundColor = glow.color;
    $('wavelength-color').textContent = `${glow.name} · ${wavelengthNm} nm`;
    $('wavelength-color').style.color = glow.color;
    $('photon-arrows').innerHTML = [0.42, 0.5, 0.58].map((f, i) => {
      const x = mesaL + f * mesaW, origin = mqw.y + mqw.h / 2;
      const rise = i === 1 ? 82 : 62, tip = origin - rise;
      return `<path d="M${x} ${origin}v-${rise}"/><path d="m${x - 5} ${tip + 7} 5-7 5 7"/>`;
    }).join('');
    $('size-label').textContent = `${sizeUm} μm pixel · mesa ${Math.round(mesaW / fullW * 100)}%`;
  }

  function drawChart() {
    const canvas = $('eqe-chart');
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !state) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    const m = { l: 48, r: 14, t: 16, b: 39 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    const X = (j) => m.l + ((Math.log10(j) + 1) / 4) * pw;
    const curve = [];
    for (let i = 0; i <= 80; i++) {
      const j = Math.pow(10, -1 + 4 * i / 80);
      curve.push({ j, y: calculate(state.p, j).eqe * 100 });
    }
    const max = Math.max(10, Math.ceil(Math.max(...curve.map((d) => d.y)) / 10) * 10);
    const Y = (v) => m.t + ph - v / max * ph;

    ctx.clearRect(0, 0, w, h);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
      const val = max * f, y = Y(val);
      ctx.strokeStyle = '#e8edf0'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
      ctx.fillStyle = '#7b8792'; ctx.textAlign = 'right'; ctx.fillText(`${val.toFixed(0)}%`, m.l - 8, y);
    });
    [0.1, 1, 10, 100, 1000].forEach((j) => {
      const x = X(j);
      ctx.strokeStyle = '#f0f2f4'; ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke();
      ctx.fillStyle = '#7b8792'; ctx.textAlign = 'center'; ctx.fillText(j < 1 ? '0.1' : String(j), x, h - 23);
    });
    ctx.beginPath();
    curve.forEach((d, i) => i ? ctx.lineTo(X(d.j), Y(d.y)) : ctx.moveTo(X(d.j), Y(d.y)));
    ctx.lineWidth = 3; ctx.strokeStyle = '#0c8e83'; ctx.lineJoin = 'round'; ctx.stroke();
    const dotX = X(state.p.currentDensity), dotY = Y(state.result.eqe * 100);
    ctx.beginPath(); ctx.arc(dotX, dotY, 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#db7b45'; ctx.stroke();
    ctx.fillStyle = '#53616d'; ctx.textAlign = 'center';
    ctx.fillText(window.I18N && window.I18N.lang === 'ko' ? 'EQE (%)' : 'EQE (%)', m.l + pw / 2, 8);
  }

  function update() {
    const p = read();
    const result = calculate(p, p.currentDensity);
    updateOutputs(p, result);
    drawChart();
    drawPhotonChart();
  }

  function drawPhotonChart() {
    const canvas = $('photon-chart');
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !state) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    const m = { l: 58, r: 14, t: 16, b: 39 };
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    const area = Math.pow(state.p.sizeUm * 1e-4, 2);
    const currentAt = (j) => j * area;
    const photonsAt = (j) => currentAt(j) / q * calculate(state.p, j).eqe;
    const points = [];
    for (let i = 0; i <= 80; i++) {
      const j = Math.pow(10, -1 + 4 * i / 80);
      points.push({ current: currentAt(j), photons: photonsAt(j) });
    }
    const minX = Math.log10(points[0].current), maxX = Math.log10(points[points.length - 1].current);
    const minY = Math.floor(Math.log10(Math.max(1, Math.min(...points.map((d) => d.photons)))));
    const maxY = Math.ceil(Math.log10(Math.max(...points.map((d) => d.photons))));
    const yLo = Math.min(minY, maxY - 3), yHi = Math.max(maxY, minY + 1);
    const X = (current) => m.l + (Math.log10(current) - minX) / (maxX - minX) * pw;
    const Y = (photons) => m.t + ph - (Math.log10(Math.max(photons, 1)) - yLo) / (yHi - yLo) * ph;
    ctx.clearRect(0, 0, w, h);
    ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    for (let exp = yLo; exp <= yHi; exp++) {
      const y = Y(Math.pow(10, exp));
      ctx.strokeStyle = '#e8edf0'; ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(w - m.r, y); ctx.stroke();
      ctx.fillStyle = '#7b8792'; ctx.textAlign = 'right'; ctx.fillText(`1e${exp}`, m.l - 8, y);
    }
    for (let exp = Math.ceil(minX); exp <= Math.floor(maxX); exp++) {
      const current = Math.pow(10, exp), x = X(current);
      ctx.strokeStyle = '#f0f2f4'; ctx.beginPath(); ctx.moveTo(x, m.t); ctx.lineTo(x, m.t + ph); ctx.stroke();
      ctx.fillStyle = '#7b8792'; ctx.textAlign = 'center'; ctx.fillText(prettyCurrent(current), x, h - 22);
    }
    ctx.beginPath();
    points.forEach((d, i) => i ? ctx.lineTo(X(d.current), Y(d.photons)) : ctx.moveTo(X(d.current), Y(d.photons)));
    ctx.lineWidth = 3; ctx.strokeStyle = '#db7b45'; ctx.lineJoin = 'round'; ctx.stroke();
    const current = state.p.currentDensity * area;
    const photons = current / q * state.result.eqe;
    ctx.beginPath(); ctx.arc(X(current), Y(photons), 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#a44f2b'; ctx.stroke();
  }

  sliders.forEach((id) => $(id).addEventListener('input', update));
  $('reset').addEventListener('click', () => {
    Object.entries(defaults).forEach(([id, value]) => { $(id).value = String(value); });
    update();
  });
  window.addEventListener('resize', () => { drawChart(); drawPhotonChart(); });
  update();
})();
