// Ideal resonant interactions for Nielsen & Chuang §7.6. No external libraries.
export const PI = Math.PI;
export const abs2 = z => z[0] ** 2 + z[1] ** 2;
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const scale = (a, s) => [a[0] * s, a[1] * s];
const conj = a => [a[0], -a[1]];
const zeros = n => Array.from({ length: n }, () => [0, 0]);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
function finite(...values) {
  if (values.some(x => !Number.isFinite(x))) throw new RangeError('Parameters must be finite numbers.');
}
export function fidelity(a, b) {
  return clamp(abs2(a.reduce((s, z, i) => add(s, mul(conj(z), b[i])), [0, 0])), 0, 1);
}
export function logicalInput(name) {
  const s = Math.SQRT1_2;
  const inputs = {
    '00': [1, 0, 0, 0], '01': [0, 1, 0, 0], '10': [0, 0, 1, 0], '11': [0, 0, 0, 1],
    plus0: [s, 0, s, 0], plus1: [0, s, 0, s], uniform: [.5, .5, .5, .5],
  };
  if (!Object.hasOwn(inputs, name)) throw new RangeError('Unknown input state.');
  return inputs[name].map(v => [v, 0]);
}
// exp of a Hermitian two-state interaction. k is the lower-left generator entry.
// In basis (g,e), U = [[cos(θ/2), -conj(k) sin(θ/2)], [k sin(θ/2), cos(θ/2)]].
export function rotatePair(state, g, e, theta, phi = 0, carrier = false) {
  const c = Math.cos(theta / 2), s = Math.sin(theta / 2);
  const k = carrier ? [Math.sin(phi), -Math.cos(phi)] : [Math.cos(phi), Math.sin(phi)];
  const a = state[g], b = state[e];
  state[g] = add(scale(a, c), scale(mul(conj(k), b), -s));
  state[e] = add(scale(mul(k, a), s), scale(b, c));
}
// H^fraction is a continuous unitary path with exact endpoints I and H.
// This is a visualization of an ideal composite carrier block, not a single resonant pulse.
function hadamardPair(state, a, b, fraction) {
  const x = state[a], y = state[b], s = Math.SQRT1_2;
  const hx = scale(add(x, y), s), hy = scale(add(x, scale(y, -1)), s);
  const angle = PI * fraction / 2, phase = [Math.cos(angle), Math.sin(angle)];
  state[a] = mul(phase, add(scale(x, Math.cos(angle)), mul([0, -Math.sin(angle)], hx)));
  state[b] = mul(phase, add(scale(y, Math.cos(angle)), mul([0, -Math.sin(angle)], hy)));
}
export const ION_BASIS = Array.from({ length: 12 }, (_, i) => ({
  control: Math.floor(i / 4), target: Math.floor(i / 2) % 2, n: i % 2,
  label: `|${Math.floor(i / 4) === 2 ? 'a' : Math.floor(i / 4)}${Math.floor(i / 2) % 2},${i % 2}⟩`,
}));
const ionIndex = (c, t, n) => c * 4 + t * 2 + n;
export function embedIons(logical) {
  const out = zeros(12);
  logical.forEach((z, i) => out[ionIndex(Math.floor(i / 2), i % 2, 0)] = [...z]);
  return out;
}
function targetH(state, f) {
  for (let c = 0; c < 3; c++) for (let n = 0; n < 2; n++) {
    hadamardPair(state, ionIndex(c, 0, n), ionIndex(c, 1, n), f);
  }
}
function mapTarget(state, angle) {
  for (let c = 0; c < 3; c++) {
    // Phase π gives |1,0> -> |0,1>, including the sign of Eq. (7.125).
    rotatePair(state, ionIndex(c, 0, 1), ionIndex(c, 1, 0), angle, PI);
  }
}
function ionAux(state, angle) {
  for (let t = 0; t < 2; t++) rotatePair(state, ionIndex(1, t, 1), ionIndex(2, t, 0), angle, 0, true);
}
function ionSummary(state, ideal) {
  const probabilities = Array(5).fill(0), phonons = [0, 0];
  let auxiliary = 0;
  state.forEach((z, i) => {
    const p = abs2(z), b = ION_BASIS[i];
    probabilities[b.control === 2 ? 4 : b.control * 2 + b.target] += p;
    phonons[b.n] += p;
    if (b.control === 2) auxiliary += p;
  });
  return { state, probabilities, phonons, auxiliary, fidelity: fidelity(ideal, state), ground: phonons[0], meanN: phonons[1] };
}
export function simulateIons({ input = 'plus0', construction = 'cnot', progress = 5, area = 2 * PI } = {}) {
  finite(progress, area);
  if (!['cnot', 'cz'].includes(construction)) throw new RangeError('Unknown gate construction.');
  const initial = logicalInput(input), state = embedIons(initial);
  const idealLogical = construction === 'cnot'
    ? [initial[0], initial[1], initial[3], initial[2]]
    : initial.map((z, i) => scale(z, i === 3 ? -1 : 1));
  const ideal = embedIons(idealLogical), p = clamp(progress, 0, 5);
  const fractions = Array.from({ length: 5 }, (_, i) => clamp(p - i, 0, 1));
  if (construction === 'cnot') targetH(state, fractions[0]);
  mapTarget(state, PI * fractions[1]);
  ionAux(state, area * fractions[2]);
  mapTarget(state, -PI * fractions[3]);
  if (construction === 'cnot') targetH(state, fractions[4]);
  return { ...ionSummary(state, ideal), ideal, basis: ION_BASIS, fractions };
}
export const PULSE_N = 4;
export const PULSE_BASIS = Array.from({ length: 2 * PULSE_N }, (_, i) => ({
  spin: Math.floor(i / PULSE_N), n: i % PULSE_N, label: `|${Math.floor(i / PULSE_N)},${i % PULSE_N}⟩`,
}));
export function pulseInitial(input) {
  const out = zeros(2 * PULSE_N);
  if (input === 'plus0') { out[0] = [Math.SQRT1_2, 0]; out[PULSE_N] = [Math.SQRT1_2, 0]; return out; }
  if (!['00', '10', '01', '11', '02'].includes(input)) throw new RangeError('Unknown pulse input.');
  out[Number(input[0]) * PULSE_N + Number(input[1])] = [1, 0];
  return out;
}
export function pulseEvolution(initial, { kind = 'red', theta = PI, phi = 0 } = {}) {
  finite(theta, phi);
  if (!['carrier', 'red', 'blue'].includes(kind)) throw new RangeError('Unknown transition.');
  const state = initial.map(z => [...z]);
  if (state.length !== 2 * PULSE_N) throw new RangeError('Invalid pulse state dimension.');
  for (let n = 0; n < PULSE_N; n++) {
    if (kind === 'carrier') rotatePair(state, n, PULSE_N + n, theta, phi, true);
    if (kind === 'red' && n > 0) rotatePair(state, n, PULSE_N + n - 1, theta * Math.sqrt(n), phi);
    if (kind === 'blue' && n + 1 < PULSE_N) rotatePair(state, n, PULSE_N + n + 1, theta * Math.sqrt(n + 1), phi);
  }
  return state;
}
export function simulatePulse({ input = '10', kind = 'red', theta = PI, phi = 0, eta = .15 } = {}) {
  finite(eta);
  if (eta <= 0) throw new RangeError('η must be positive.');
  const initial = pulseInitial(input), state = pulseEvolution(initial, { kind, theta, phi });
  const phonons = Array(PULSE_N).fill(0), probabilities = [0, 0];
  state.forEach((z, i) => { const b = PULSE_BASIS[i], p = abs2(z); phonons[b.n] += p; probabilities[b.spin] += p; });
  return {
    state, basis: PULSE_BASIS, probabilities, phonons, excited: probabilities[1],
    meanN: phonons.reduce((s, p, n) => s + p * n, 0), ground: phonons[0],
    survival: fidelity(initial, state), duration: theta / (kind === 'carrier' ? 1 : eta)
  };
}
// Spin–phonon gate: internal spin has states 0,1,a; n=0,1 is the control qubit.
export const SPIN_BASIS = Array.from({ length: 6 }, (_, i) => ({
  spin: Math.floor(i / 2), n: i % 2, label: `|${Math.floor(i / 2) === 2 ? 'a' : Math.floor(i / 2)},${i % 2}⟩`,
}));
function spinRotation(state, f, inverse, construction) {
  for (let n = 0; n < 2; n++) {
    if (construction === 'cnot') hadamardPair(state, n, 2 + n, f);
    else rotatePair(state, n, 2 + n, (inverse ? -1 : 1) * PI / 2 * f, PI / 2, true);
  }
}
export function simulateSpin({ input = 'plus0', construction = 'cnot', progress = 3, area = 2 * PI } = {}) {
  finite(progress, area);
  if (!['cnot', 'ramsey', 'cz'].includes(construction)) throw new RangeError('Unknown spin construction.');
  // Logical input order is |phonon,spin>; physical basis displayed is |spin,n>.
  const logical = logicalInput(input), state = zeros(6), ideal = zeros(6);
  logical.forEach((z, i) => {
    const n = Math.floor(i / 2), s = i % 2;
    state[s * 2 + n] = [...z];
    const outSpin = construction === 'cz' ? s : s ^ n;
    const sign = construction === 'ramsey' && n === 1 ? -1 : construction === 'cz' && n === 1 && s === 1 ? -1 : 1;
    ideal[outSpin * 2 + n] = scale(z, sign);
  });
  const p = clamp(progress, 0, 3), fractions = Array.from({ length: 3 }, (_, i) => clamp(p - i, 0, 1));
  if (construction !== 'cz') spinRotation(state, fractions[0], false, construction);
  rotatePair(state, 3, 4, area * fractions[1], 0, true);
  if (construction !== 'cz') spinRotation(state, fractions[2], true, construction);
  const probabilities = Array(5).fill(0), phonons = [0, 0]; let auxiliary = 0;
  state.forEach((z, i) => {
    const p = abs2(z), b = SPIN_BASIS[i]; phonons[b.n] += p;
    probabilities[b.spin === 2 ? 4 : b.n * 2 + b.spin] += p;
    if (b.spin === 2) auxiliary += p;
  });
  return {
    state, ideal, basis: SPIN_BASIS, fractions, probabilities, phonons, auxiliary,
    fidelity: fidelity(ideal, state), ground: phonons[0], meanN: phonons[1]
  };
}
