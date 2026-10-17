(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const q = 1.602176634e-19;
  const h = 6.62607015e-34;
  const c = 299792458;
  const defaults = { size: 10, current: 65, injection: 95, srv: 4.3, abulk: 7, bscale: 1, cscale: 1, lee: 35, wavelength: 450, active: 30, substrate: 150, nlayer: 600, barrier: 10, well: 3, wells: 5, ebl: 20, player: 120, tco: 80, passivation: 12 };
  const sliders = Object.keys(defaults);
  let state = null;

  function read() {
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
      activeNm: Number($('active').value),
      layers: Object.fromEntries(['substrate', 'nlayer', 'barrier', 'well', 'wells', 'ebl', 'player', 'tco', 'passivation'].map((id) => [id, Number($(id).value)])),
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
    $('active-out').textContent = `${p.activeNm} nm`;
    Object.entries(p.layers).forEach(([id, value]) => { $(`${id}-out`).textContent = `${value} ${id === 'wells' ? '개' : 'nm'}`; });

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
    const width = 120 + (sizeUm - 1) / 99 * 340;
    const left = 360 - width / 2;
    const right = left + width;
    const substrateH = 20 + (layers.substrate - 50) / 450 * 26;
    $('substrate-layer').setAttribute('height', substrateH);
    $('substrate-layer').setAttribute('y', 280 - substrateH);
    $('substrate-pattern-layer').setAttribute('height', substrateH);
    $('substrate-pattern-layer').setAttribute('y', 280 - substrateH);
    const nH = 28 + (layers.nlayer - 100) / 1400 * 35;
    const activeStackNm = layers.wells * (layers.well + layers.barrier);
    const mqwH = 12 + activeStackNm / 224 * 18;
    const eblH = 5 + (layers.ebl - 5) / 35 * 7;
    const pH = 24 + (layers.player - 50) / 250 * 27;
    const tcoH = 7 + (layers.tco - 20) / 130 * 9;
    const bottom = 238;
    const nY = bottom - nH, mqwY = nY - mqwH, eblY = mqwY - eblH, pY = eblY - pH, tcoY = pY - tcoH;
    [['n-layer', nY, nH], ['mqw', mqwY, mqwH], ['ebl-layer', eblY, eblH], ['p-layer', pY, pH], ['contact-layer', tcoY, tcoH]].forEach(([id, y, height]) => {
      const el = $(id); el.setAttribute('x', left); el.setAttribute('y', y); el.setAttribute('width', width); el.setAttribute('height', height);
    });
    $('n-label').setAttribute('y', nY + nH / 2 + 5); $('p-label').setAttribute('y', pY + pH / 2 + 5);
    $('mqw-label').setAttribute('y', mqwY - 3); $('mqw-label').textContent = `MQW · ${layers.wells} wells`;
    $('ebl-label').setAttribute('y', eblY + eblH - 1);
    $('contact-label').setAttribute('y', tcoY - 3);
    $('well-lines').innerHTML = Array.from({ length: layers.wells - 1 }, (_, i) => `<path d="M${left} ${mqwY + (i + 1) * mqwH / layers.wells}h${width}"/>`).join('');
    const passW = 4 + (layers.passivation - 5) / 35 * 10;
    $('passivation-left').setAttribute('d', `M${left - passW} ${tcoY}h${passW}v${bottom - tcoY}h-${passW}z`);
    $('passivation-right').setAttribute('d', `M${right} ${tcoY}h${passW}v${bottom - tcoY}h-${passW}z`);
    $('metal-left').setAttribute('d', `M${left} ${tcoY - 8}h${width * 0.18}v8h-${width * 0.18}z`);
    $('metal-right').setAttribute('d', `M${right - width * 0.18} ${tcoY - 8}h${width * 0.18}v8h-${width * 0.18}z`);
    $('defect-sites').innerHTML = `<circle cx="${left - 3}" cy="158" r="3"/><circle cx="${right + 3}" cy="178" r="3"/><circle cx="${left - 3}" cy="204" r="3"/>`;
    const glow = wavelengthColor(wavelengthNm);
    $('photon-arrows').setAttribute('stroke', glow.color);
    $('mqw').setAttribute('fill', glow.color);
    $('wavelength-swatch').style.backgroundColor = glow.color;
    $('wavelength-swatch').style.boxShadow = `0 0 14px ${glow.color}`;
    $('wavelength-color').textContent = `${glow.name} · ${wavelengthNm} nm`;
    $('wavelength-color').style.color = glow.color;
    $('photon-arrows').innerHTML = [0.42, 0.5, 0.58].map((f, i) => {
      const x = 360 + (f - 0.5) * width;
      const rise = i === 1 ? 62 : 45, tip = 181 - rise;
      return `<path d="M${x} 181v-${rise}"/><path d="m${x - 5} ${tip + 7} 5-7 5 7"/>`;
    }).join('');
    $('size-label').textContent = `${sizeUm} μm`;
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
