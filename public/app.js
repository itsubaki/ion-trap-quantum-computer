import { PI, abs2, simulateIons, simulatePulse, simulateSpin } from './ion.js';

const $ = id => document.getElementById(id);
const colors = ['#6bd9ad', '#6facfa', '#b59afa'];
const logicalOptions = [
  ['plus0', '|+0⟩\u2002Superposition'],
  ['10', '|10⟩\u2002Basis state'],
  ['11', '|11⟩\u2002Basis state'],
  ['00', '|00⟩\u2002Basis state'],
  ['01', '|01⟩\u2002Basis state'],
  ['plus1', '|+1⟩\u2002Superposition'],
  ['uniform', '|++⟩\u2002Equal superposition'],
];
const pulseOptions = [
  ['10', '|1,0⟩\u2002Spin excitation'],
  ['00', '|0,0⟩\u2002Ground state'],
  ['01', '|0,1⟩\u2002One phonon'],
  ['11', '|1,1⟩\u2002Spin excitation and one phonon'],
  ['02', '|0,2⟩\u2002Two phonons'],
  ['plus0', '|+,0⟩\u2002Spin superposition'],
];
const defaults = {
  ions: { input: 'plus0', construction: 'cnot', position: 5, area: 2 * PI },
  pulse: { input: '10', transition: 'red', position: PI, phase: 0, eta: .15 },
  spin: { input: 'plus0', construction: 'cnot', position: 3, area: 2 * PI },
};
const saved = structuredClone(defaults);
let mode = 'ions', playing = false, frame = 0, previousTime = 0, result, sweepKey = '', sweepCache;
const percent = p => `${(Math.max(0, Math.min(1, p)) * 100).toFixed(1)}%`;
const fixed = n => (Math.abs(n) < 5e-8 ? 0 : n).toFixed(3);
function piText(x) {
  const q = x / PI;
  if (Math.abs(q) < 1e-8) return '0';
  if (Math.abs(q - 1) < 1e-7) return 'π';
  if (Math.abs(q + 1) < 1e-7) return '−π';
  if (Math.abs(q - .5) < 1e-7) return 'π/2';
  if (Math.abs(q - Math.round(q)) < 1e-7) return `${Math.round(q)}π`;
  return `${q.toFixed(2)}π`;
}
const complex = z => {
  const re = Math.abs(z[0]) < .0005 ? 0 : z[0], im = Math.abs(z[1]) < .0005 ? 0 : z[1];
  if (!im) return re.toFixed(3);
  if (!re) return `${im < 0 ? '−' : ''}${Math.abs(im).toFixed(3)}i`;
  return `${re.toFixed(3)} ${im < 0 ? '−' : '+'} ${Math.abs(im).toFixed(3)}i`;
};
function options(el, values, value) {
  el.replaceChildren(...values.map(([v, label]) => new Option(label, v)));
  el.value = value;
}
function readControls() {
  const state = saved[mode];
  state.input = $('input').value;
  state.position = Number($('position').value);
  if (mode === 'pulse') Object.assign(state, { transition: $('transition').value, phase: Number($('phase').value), eta: Number($('eta').value) });
  else Object.assign(state, { construction: $('construction').value, area: Number($('area').value) });
}
function simulation(position = saved[mode].position) {
  const s = saved[mode];
  if (mode === 'ions') return simulateIons({ input: s.input, construction: s.construction, progress: position, area: s.area });
  if (mode === 'spin') return simulateSpin({ input: s.input, construction: s.construction, progress: position, area: s.area });
  return simulatePulse({ input: s.input, kind: s.transition, theta: position, phi: s.phase, eta: s.eta });
}
function stageLabels() {
  const c = saved[mode].construction;
  if (mode === 'ions') return ['Input', c === 'cz' ? 'Start' : 'H target', 'Map → bus', 'Aux pulse', 'Unmap', 'Output'];
  if (mode === 'spin') return ['Input', c === 'cz' ? 'Start' : c === 'ramsey' ? 'Ry(+π/2)' : 'H spin', 'Aux pulse', 'Output'];
  return ['0', 'π/2', 'π', '2π'];
}
function configure() {
  const pulse = mode === 'pulse', s = saved[mode];
  $('play').textContent = pulse ? '▶ Play laser pulse' : '▶ Play pulse sequence';
  document.querySelectorAll('[data-mode]').forEach(el => {
    const selected = el.dataset.mode === mode;
    el.setAttribute('aria-selected', String(selected)); el.tabIndex = selected ? 0 : -1;
  });
  $('experiment').setAttribute('aria-labelledby', `tab-${mode}`);
  options($('input'), pulse ? pulseOptions : logicalOptions, s.input);
  if (!pulse) options($('construction'), mode === 'ions'
    ? [['cnot', 'CNOT\u2002Five blocks'], ['cz', 'Controlled-Z\u2002Three blocks']]
    : [['cnot', 'CNOT\u2002H → CZ → H'], ['ramsey', 'Ramsey\u2002Ry → CZ → inverse Ry'], ['cz', 'Controlled-Z\u2002Auxiliary pulse']], s.construction);
  $('construction-control').hidden = pulse;
  $('area-control').hidden = pulse;
  ['transition-control', 'phase-control', 'eta-control'].forEach(id => $(id).hidden = !pulse);
  $('input-label').textContent = pulse ? 'Initial State · |spin, n⟩' : mode === 'spin' ? 'Logical Input · |phonon, spin⟩' : 'Logical Input · |control, target⟩';
  $('position').max = pulse ? 4 * PI : mode === 'ions' ? 5 : 3;
  $('position').value = s.position;
  $('position-label').textContent = pulse ? 'Pulse area θ' : 'Sequence progress';
  $('scale-start').textContent = pulse ? '0' : 'Input';
  $('scale-mid').textContent = pulse ? '2π' : 'Auxiliary pulse';
  $('scale-end').textContent = pulse ? '4π' : 'Output';
  if (pulse) { $('transition').value = s.transition; $('phase').value = s.phase; $('eta').value = s.eta; }
  else $('area').value = s.area;
  $('presets').replaceChildren();
  const presets = pulse ? [[0, 'θ = 0'], [PI, 'θ = π'], [2 * PI, 'θ = 2π']]
    : [[0, 'Input'], [mode === 'ions' ? 2.5 : 1.5, 'Mid-pulse'], [mode === 'ions' ? 5 : 3, 'Output']];
  presets.forEach(([value, label], i) => {
    const button = document.createElement('button'); button.textContent = label;
    if (i === 2) button.className = 'primary';
    button.addEventListener('click', () => setPosition(value)); $('presets').append(button);
  });
  const labels = stageLabels(), stops = pulse ? [0, PI / 2, PI, 2 * PI] : labels.map((_, i) => i);
  $('stages').style.gridTemplateColumns = `repeat(${labels.length}, minmax(0,1fr))`;
  $('stages').replaceChildren(...labels.map((label, i) => {
    const b = document.createElement('button'); b.textContent = label; b.dataset.stop = stops[i];
    b.addEventListener('click', () => setPosition(stops[i])); return b;
  }));
  $('view-title').textContent = pulse ? 'Laser-Driven State Transitions' : mode === 'ions' ? 'A Shared Phonon Bus' : 'One Ion, Two Qubits';
  $('view-badge').textContent = pulse ? '1 ION · MOTIONAL LADDER' : mode === 'ions' ? '2 IONS · 1 BUS' : 'SPIN + PHONON';
  $('stat1-label').textContent = pulse ? 'Internal excitation · P(spin = 1)' : 'Full-state fidelity with ideal output';
  $('stat2-label').textContent = pulse ? 'Mean phonon number · ⟨n⟩' : 'Bus in ground state · P(n = 0)';
  $('stat3-label').textContent = pulse ? 'Required duration · Ωt' : 'Auxiliary population · P(a)';
  $('prob-title').textContent = pulse ? 'Internal-State Probabilities' : 'Qubit Measurement Probabilities';
  $('prob-badge').textContent = mode === 'ions' ? 'IONS · BUS TRACED OUT' : pulse ? 'MOTION TRACED OUT' : 'PHONON, SPIN';
  $('state-title').textContent = mode === 'ions' ? 'Full amplitudes · |control target, n⟩' : 'Full amplitudes · |spin, n⟩';
  $('state-vector').classList.toggle('six', mode === 'spin');
  $('sweep-title').textContent = pulse ? 'Carrier & Sideband Oscillations' : 'Through the Pulse Sequence';
  $('chart').setAttribute('aria-label', pulse ? 'Internal excitation and motional populations versus pulse area from zero to four pi' : 'Full-state fidelity, one-phonon probability, and auxiliary population versus sequence progress');
  $('chart-note').textContent = pulse ? 'The marker follows the current pulse area. The √n coupling makes different motional states oscillate at different rates.' : 'The marker follows the selected observation point. Curves use the current input and auxiliary pulse area; each block has its own normalized duration.';
  render();
}
function setPosition(value) {
  stop(); saved[mode].position = value; $('position').value = value; render();
}
function stop() {
  playing = false; cancelAnimationFrame(frame); previousTime = 0;
  $('play').setAttribute('aria-pressed', 'false');
  $('play').textContent = mode === 'pulse' ? '▶ Play laser pulse' : '▶ Play pulse sequence';
}
function start() {
  playing = true; previousTime = 0;
  const max = Number($('position').max);
  if (saved[mode].position >= max - 1e-7) saved[mode].position = 0;
  $('play').setAttribute('aria-pressed', 'true'); $('play').textContent = 'Ⅱ Pause';
  frame = requestAnimationFrame(tick);
}
function tick(time) {
  if (!playing) return;
  const max = Number($('position').max), dt = previousTime ? Math.min((time - previousTime) / 1000, .1) : 0;
  previousTime = time;
  saved[mode].position = Math.min(max, saved[mode].position + dt * max / 12);
  $('position').value = saved[mode].position; render();
  if (saved[mode].position >= max) stop(); else frame = requestAnimationFrame(tick);
}
function stageName() {
  const p = saved[mode].position;
  if (mode === 'pulse') return `θ = ${piText(p)}`;
  const labels = stageLabels();
  if (Math.abs(p - Math.round(p)) < 1e-6) return labels[Math.round(p)];
  return `During ${labels[Math.ceil(p)]}`;
}
function updateText() {
  const s = saved[mode], pulse = mode === 'pulse';
  $('position-value').textContent = pulse ? piText(s.position) : `${s.position.toFixed(2)} / ${$('position').max}`;
  $('position').setAttribute('aria-valuetext', pulse ? piText(s.position) : stageName());
  $('area-value').textContent = piText(s.area ?? 2 * PI);
  $('phase-value').textContent = piText(s.phase ?? 0);
  $('eta-value').textContent = (s.eta ?? .15).toFixed(2);
  $('stat1').textContent = pulse ? percent(result.excited) : fixed(result.fidelity);
  $('stat2').textContent = pulse ? fixed(result.meanN) : percent(result.ground);
  $('stat3').textContent = pulse ? result.duration.toFixed(2) : percent(result.auxiliary);
  $('stage-name').textContent = stageName();
  $('stages').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(Math.abs(Number(b.dataset.stop) - s.position) < 1e-6)));
  if (pulse) {
    const kind = s.transition;
    const transition = kind === 'carrier' ? '|0,n⟩ ↔ |1,n⟩' : kind === 'red' ? '|0,n⟩ ↔ |1,n−1⟩' : '|0,n⟩ ↔ |1,n+1⟩';
    $('encoding').innerHTML = `${transition}<div class="formula-line">${kind === 'carrier' ? 'θ = Ωt' : 'θ = ηΩt'}<br>φ = ${piText(s.phase)}</div><div class="math-caption">Kets are |internal spin, phonon number⟩.</div>`;
    $('control-note').textContent = 'The area θ is referenced to the n = 0 ↔ 1 sideband pair. Motional factors √n multiply this area for higher levels. At fixed θ, η changes pulse duration.';
    $('circuit-caption').textContent = `${kind === 'carrier' ? 'Carrier driving changes only the spin.' : kind === 'red' ? 'Red sideband: a spin excitation consumes one phonon; a spin de-excitation creates one.' : 'Blue sideband: spin and motion are excited or de-excited together.'} Node brightness represents population; levels are schematic.`;
    const dark = kind === 'red' && s.input === '00';
    $('insight').textContent = dark ? 'The motional ground state |0,0⟩ is dark to the red sideband: there is no phonon to remove. The state stays unchanged for every pulse area.'
      : s.input === '02' && kind === 'red' ? 'Two initial phonons give a √2-enhanced coupling. A nominal π pulse is no longer a complete transfer; try θ = π/√2 with the slider.'
        : `Current internal excitation is ${percent(result.excited)}, with ⟨n⟩ = ${fixed(result.meanN)}. ${kind === 'carrier' ? 'No phonon is exchanged by a carrier pulse.' : 'The laser coherently exchanges population with the connected motional state.'}`;
    $('prob-note').textContent = 'Spin probabilities sum over all phonon numbers. The full spin–motion state and its relative phases appear above.';
    $('state-note').textContent = 'All eight retained amplitudes are shown. Phase dials: right = 0, up = +π/2, left = π. The n = 3 level is included for the blue-sideband input |0,2⟩.';
  } else if (mode === 'ions') {
    $('encoding').innerHTML = `|qⱼ qₖ,n⟩ · bus starts in |0⟩<div class="formula-line">${s.construction === 'cnot' ? 'Hₖ → Mₖ → CZⱼ,bus → Mₖ⁻¹ → Hₖ' : 'Mₖ → CZⱼ,bus → Mₖ⁻¹'}<br>A = 2π ⇒ ${s.construction === 'cnot' ? 'CNOTⱼₖ' : 'CZⱼₖ'}</div><div class="math-caption">j: control ion · k: target ion · a: auxiliary state</div>`;
    $('control-note').textContent = 'Map the target qubit into the shared motion, apply an auxiliary pulse on the control ion, then reverse the map. Change A to inspect an incomplete phase gate.';
    $('circuit-caption').textContent = 'Time runs left to right. M uses a red-sideband π pulse on the target; M⁻¹ reverses it. The auxiliary pulse acts on the control ion. Apparatus schematic is not to scale.';
    const p = s.position;
    $('insight').textContent = p < .001 ? 'The bus starts in its ground state, independent of the two ion qubits. Select an observation point or play the sequence to follow the state.'
      : p < 1.001 ? 'The first Hadamard rotates the target before mapping. These H blocks are ideal composite single-qubit operations.'
        : p < 2.001 ? 'The target qubit is being mapped into the phonon bus. A single shared motional mode carries the quantum information between ions.'
          : p < 3.001 ? `The auxiliary pulse couples |1ⱼ,1bus⟩ to |aⱼ,0bus⟩. A full 2π cycle returns the population with a −1 phase. Currently P(a) = ${percent(result.auxiliary)}.`
            : p < 4.001 ? 'The inverse map transfers the bus information back to the target. Reversing the pulse phase/angle is essential for cancelling the mapping signs.'
              : result.fidelity > .999999 ? `The gate is complete. The bus has returned to |0⟩ and the auxiliary level is empty.${s.input === 'plus0' && s.construction === 'cnot' ? ' The two ions are now in the Bell state (|00⟩ + |11⟩)/√2.' : ''}`
                : `The final state differs from the ideal gate: F = ${fixed(result.fidelity)}. At this auxiliary area, the coupled branch may have the wrong phase or remain in |a⟩.`;
    $('prob-note').textContent = 'Kets below are |control, target⟩. Probabilities sum over the bus. Auxiliary population is shown separately, so all five bars sum to one.';
    $('state-note').textContent = 'All 12 amplitudes retain the bus and auxiliary level. The five qubit bars below trace out the bus. Phase dials: right = 0, up = +π/2, left = π.';
  } else {
    const ramsey = s.construction === 'ramsey', cz = s.construction === 'cz';
    $('encoding').innerHTML = `Logical |n,spin⟩ · physical |spin,n⟩<div class="formula-line">${cz ? 'Auxiliary 2π cycle → CZ' : ramsey ? 'Ry(π/2) → CZ → Ry(−π/2)' : 'H → CZ → H = CNOT'}<br>|1,1⟩ ↔ |a,0⟩</div><div class="math-caption">The phonon controls the internal spin.</div>`;
    $('control-note').textContent = 'This mode has one ion and two qubits. Compare the phase-corrected CNOT with the textbook Ramsey construction; superpositions expose their relative phase difference.';
    $('circuit-caption').textContent = 'The highlighted auxiliary transition is conditional on one phonon and spin state |1⟩. A 2π excursion gives a minus sign. Energy spacings are schematic.';
    $('insight').textContent = ramsey ? 'The Ramsey sequence produces controlled(−X). Its classical truth table matches CNOT, but the n = 1 branch gets an extra −1 phase. Fidelity here uses that Ramsey output as the ideal reference.'
      : cz ? 'Only |spin = 1, n = 1⟩ participates in the auxiliary cycle. At A = 2π it returns with a relative phase of π, implementing controlled-Z.'
        : 'The phonon is the control and the spin is the target. H before and after the conditional phase converts it into an exact CNOT at A = 2π.';
    $('prob-note').textContent = 'Kets below use logical order |phonon, spin⟩. The six amplitudes above use physical order |spin, n⟩. The auxiliary level is kept explicitly.';
    $('state-note').textContent = 'The historical demonstration in §7.6.4 used an internal qubit and a motional qubit of one ion. It differs from the two-ion construction in experiment 01.';
  }
}
const svgText = (x, y, text, cls = 'svg-label', extra = '') => `<text x="${x}" y="${y}" class="${cls}" ${extra}>${text}</text>`;
function svgFrame(content, label, height = 270) {
  return `<svg viewBox="0 0 690 ${height}" role="img" aria-label="${label}"><defs><radialGradient id="ion-glow"><stop stop-color="#b3ffe0"/><stop offset=".35" stop-color="#6bd9ad"/><stop offset="1" stop-color="#6bd9ad" stop-opacity="0"/></radialGradient></defs>${content}</svg>`;
}
function gateBox(x, y, label, active, width = 48, height = 30) {
  return `<rect x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}" rx="6" fill="${active ? '#1f4f51' : '#1b2e45'}" stroke="${active ? colors[0] : '#4c6b91'}"/>${svgText(x, y + 4, label, 'svg-label', 'text-anchor="middle"')}`;
}
function renderIons() {
  const s = saved.ions, p = s.position, active = p > 0 && p < 5;
  const atControl = p > 2 && p <= 3;
  const targetX = atControl ? 250 : 450;
  let content = `<rect x="110" y="32" width="470" height="13" rx="6" fill="#263b52" stroke="#47617b"/><rect x="110" y="131" width="470" height="13" rx="6" fill="#263b52" stroke="#47617b"/><path d="M135 88H555" stroke="#2d4663" stroke-dasharray="4 6"/>`;
  if (active) content += `<path d="M${targetX - 100} 1L${targetX} 88" stroke="${atControl ? colors[2] : colors[1]}" stroke-width="4" opacity=".7"/>${svgText(targetX - 105, 19, atControl ? 'auxiliary drive' : 'target drive', 'svg-small')}`;
  for (const [x, name, color] of [[250, 'j · control ion', colors[0]], [450, 'k · target ion', colors[1]]]) {
    content += `<circle cx="${x}" cy="88" r="29" fill="url(#ion-glow)" opacity=".35"/><circle cx="${x}" cy="88" r="9" fill="${color}"/><circle cx="${x}" cy="88" r="18" fill="none" stroke="${color}" opacity=".35"/>${svgText(x, 119, name, 'svg-small', 'text-anchor="middle"')}`;
  }
  content += `<path d="M250 66Q350 48 450 66" stroke="${colors[2]}" fill="none" stroke-dasharray="4 4" opacity=".6"/>${svgText(350, 65, 'shared COM mode', 'svg-small', 'text-anchor="middle"')}`;
  const ys = [183, 216, 249];
  ys.forEach((y, i) => content += `${svgText(24, y + 4, ['Ion j', 'Ion k', 'Bus'][i], 'svg-small')}<path d="M83 ${y}H655" stroke="#38516b" stroke-width="1.5"/>`);
  if (s.construction === 'cnot') { content += gateBox(130, 216, 'H', p > 0 && p <= 1); content += gateBox(600, 216, 'H', p > 4); }
  content += gateBox(240, 232, 'M', p > 1 && p <= 2, 50, 55);
  content += `<path d="M365 183V249" stroke="${p > 2 && p <= 3 ? colors[2] : '#7c6fa8'}" stroke-width="2"/><circle cx="365" cy="249" r="4" fill="${colors[2]}"/>${gateBox(365, 183, 'Zₐ', p > 2 && p <= 3)}`;
  content += gateBox(490, 232, 'M⁻¹', p > 3 && p <= 4, 50, 55);
  $('apparatus').innerHTML = svgFrame(content, 'Two addressed ions in a linear trap and a circuit mapping the target into a shared phonon bus');
}
function renderPulse() {
  const s = saved.pulse, kind = s.transition, xs = [105, 265, 425, 585], ys = [192, 66];
  let content = svgText(30, 26, `${kind === 'carrier' ? 'CARRIER' : kind === 'red' ? 'RED SIDEBAND' : 'BLUE SIDEBAND'} · ${kind === 'carrier' ? 'ω = ω₀' : kind === 'red' ? 'ω = ω₀ − ωz' : 'ω = ω₀ + ωz'}`, 'svg-small');
  for (let n = 0; n < 4; n++) {
    let m = kind === 'carrier' ? n : kind === 'red' ? n - 1 : n + 1;
    if (m < 0 || m > 3) continue;
    const c = kind === 'carrier' ? colors[0] : kind === 'red' ? '#ffbf77' : colors[1];
    content += `<path d="M${xs[n]} ${ys[0] - 7}L${xs[m]} ${ys[1] + 7}" stroke="${c}" opacity=".5" stroke-width="2" stroke-dasharray="5 4"/>`;
  }
  for (let spin = 0; spin < 2; spin++) for (let n = 0; n < 4; n++) {
    const x = xs[n], y = ys[spin], p = abs2(result.state[spin * 4 + n]);
    content += `<path d="M${x - 37} ${y}H${x + 37}" stroke="#5b7492" stroke-width="2"/><circle cx="${x}" cy="${y}" r="${5 + p * 12}" fill="${spin ? colors[2] : colors[0]}" opacity="${.12 + p * .88}"/>${svgText(x, y + 32, `|${spin},${n}⟩`, 'svg-ket', 'text-anchor="middle"')}${svgText(x, y - 23, percent(p), 'svg-small', 'text-anchor="middle"')}`;
  }
  for (let n = 0; n < 4; n++) content += svgText(xs[n], 259, `n = ${n}`, 'svg-small', 'text-anchor="middle"');
  $('apparatus').innerHTML = svgFrame(content, `${kind} transitions in the internal spin and phonon energy ladder`);
}
function renderSpin() {
  const xs = [220, 475], ys = [185, 65, 120];
  let content = svgText(28, 26, 'AUXILIARY TRANSITION · |1,1⟩ ↔ |a,0⟩', 'svg-small');
  content += `<path d="M475 65L220 120" stroke="${colors[2]}" stroke-width="3" opacity=".75"/>${svgText(345, 80, 'A = ' + piText(saved.spin.area), 'svg-small', 'text-anchor="middle"')}`;
  for (let spin = 0; spin < 3; spin++) for (let n = 0; n < 2; n++) {
    const x = xs[n], y = ys[spin], p = abs2(result.state[spin * 2 + n]);
    content += `<path d="M${x - 50} ${y}H${x + 50}" stroke="${spin === 2 ? '#9c80d4' : '#5b7492'}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="${4 + p * 12}" fill="${spin === 2 ? colors[2] : colors[0]}" opacity="${.15 + p * .85}"/>${svgText(x + 62, y + 5, `|${spin === 2 ? 'a' : spin},${n}⟩`, 'svg-ket')}`;
  }
  content += svgText(220, 237, 'phonon |0⟩', 'svg-label', 'text-anchor="middle"') + svgText(475, 237, 'phonon |1⟩', 'svg-label', 'text-anchor="middle"');
  $('apparatus').innerHTML = svgFrame(content, 'Spin and auxiliary energy levels with a transition conditional on one phonon');
}
function renderAmplitudes() {
  $('state-vector').innerHTML = result.state.map((z, i) => {
    const p = abs2(z), b = result.basis[i], aux = b.control === 2 || b.spin === 2;
    const phase = Math.atan2(z[1], z[0]);
    return `<div class="amplitude${p < 1e-10 ? ' zero' : ''}${aux ? ' aux' : ''}" title="${b.label}: probability ${percent(p)}${p > 1e-10 ? `, phase ${(phase * 180 / PI).toFixed(1)}°` : ', phase undefined'}"><span class="phase-disc" aria-hidden="true"><i style="transform:rotate(${-phase}rad)"></i></span><span class="ket">${b.label}</span><strong>${complex(z)}</strong></div>`;
  }).join('');
  $('motion-mean').textContent = `⟨n⟩ = ${fixed(result.meanN)}`;
  $('motion-populations').innerHTML = result.phonons.map((p, n) => `<div class="motion-chip">n = ${n}<strong>${percent(p)}</strong></div>`).join('');
  const labels = mode === 'pulse' ? ['|0⟩', '|1⟩'] : ['|00⟩', '|01⟩', '|10⟩', '|11⟩', 'aux'];
  $('probability-bars').innerHTML = result.probabilities.map((p, i) => `<div class="bar-item${i === 4 ? ' aux' : ''}"><span class="ket">${labels[i]}</span><div class="bar-bg"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, p * 100))}%"></div></div><span class="val">${percent(p)}</span></div>`).join('');
}
function chart() {
  const state = saved[mode], pulse = mode === 'pulse';
  const key = JSON.stringify([mode, { ...state, position: null }]);
  const max = Number($('position').max);
  if (key !== sweepKey) {
    sweepKey = key;
    sweepCache = Array.from({ length: 161 }, (_, i) => {
      const x = max * i / 160, r = simulation(x);
      return { x, values: pulse ? [r.excited, r.ground, r.survival] : [r.fidelity, r.phonons[1], r.auxiliary] };
    });
    const labels = pulse ? ['P(spin = 1)', 'P(n = 0)', 'Input survival'] : ['Ideal-output fidelity', 'P(n = 1)', 'P(auxiliary)'];
    $('chart-legend').innerHTML = labels.map((s, i) => `<span><i class="dot" style="background:${colors[i]}"></i>${s}</span>`).join('');
  }
  const canvas = $('chart'), rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  if (!rect.width) return;
  canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const w = rect.width, h = rect.height, left = 37, right = 18, top = 20, bottom = 33;
  const X = x => left + (w - left - right) * x / max;
  const Y = y => h - bottom - (h - top - bottom) * y;
  ctx.font = '10px system-ui';
  for (const y of [0, .25, .5, .75, 1]) {
    ctx.strokeStyle = '#223249'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, Y(y)); ctx.lineTo(w - right, Y(y)); ctx.stroke();
    ctx.fillStyle = '#94a8c2'; ctx.textAlign = 'right'; ctx.fillText(y.toFixed(y % 1 ? 2 : 0), left - 8, Y(y) + 3);
  }
  const ticks = pulse ? [0, PI, 2 * PI, 3 * PI, 4 * PI] : Array.from({ length: max + 1 }, (_, i) => i);
  ticks.forEach(x => {
    ctx.fillStyle = '#94a8c2'; ctx.textAlign = 'center'; ctx.fillText(pulse ? piText(x).replace('1.00π', 'π').replace('.00', '') : String(x), X(x), h - 12);
    if (!pulse) { ctx.strokeStyle = '#223249'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(X(x), top); ctx.lineTo(X(x), h - bottom); ctx.stroke(); ctx.setLineDash([]); }
  });
  for (let k = 0; k < 3; k++) {
    ctx.strokeStyle = colors[k]; ctx.lineWidth = 2; ctx.setLineDash(k === 1 ? [6, 3] : k === 2 ? [2, 3] : []);
    ctx.beginPath(); sweepCache.forEach(({ x, values }, i) => i ? ctx.lineTo(X(x), Y(values[k])) : ctx.moveTo(X(x), Y(values[k]))); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.lineWidth = 1; ctx.strokeStyle = '#cbd8e7'; ctx.beginPath(); ctx.moveTo(X(state.position), top - 4); ctx.lineTo(X(state.position), h - bottom); ctx.stroke();
  const values = pulse ? [result.excited, result.ground, result.survival] : [result.fidelity, result.phonons[1], result.auxiliary];
  values.forEach((v, i) => { ctx.fillStyle = colors[i]; ctx.beginPath(); ctx.arc(X(state.position), Y(v), 3, 0, 2 * PI); ctx.fill(); });
}
function render() {
  try {
    result = simulation(); updateText();
    if (mode === 'ions') renderIons(); else if (mode === 'pulse') renderPulse(); else renderSpin();
    renderAmplitudes(); chart(); $('error').textContent = '';
  } catch (error) { stop(); $('error').textContent = error.message; }
}
function switchMode(next) { stop(); mode = next; configure(); }
document.querySelectorAll('[data-mode]').forEach(button => {
  button.addEventListener('click', () => switchMode(button.dataset.mode));
  button.addEventListener('keydown', e => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']; if (!keys.includes(e.key)) return;
    e.preventDefault(); const modes = Object.keys(defaults), i = modes.indexOf(mode);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? modes.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + modes.length) % modes.length;
    switchMode(modes[next]); $(`tab-${modes[next]}`).focus();
  });
});
['input', 'construction', 'transition'].forEach(id => $(id).addEventListener('change', () => {
  stop(); readControls(); if (id === 'construction') configure(); else render();
}));
['position', 'area', 'phase', 'eta'].forEach(id => $(id).addEventListener('input', () => { stop(); readControls(); render(); }));
$('play').addEventListener('click', () => playing ? stop() : start());
$('reset').addEventListener('click', () => { stop(); saved[mode] = structuredClone(defaults[mode]); configure(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
new ResizeObserver(() => { if (result) chart(); }).observe($('chart'));
configure();
