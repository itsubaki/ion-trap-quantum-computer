import test from 'node:test';
import assert from 'node:assert/strict';
import { PI, abs2, fidelity, logicalInput, simulateIons, simulateSpin, simulatePulse, pulseInitial, pulseEvolution, ION_BASIS } from '../public/ion.js';
const close = (a, b, e = 1e-10) => assert.ok(Math.abs(a - b) < e, `${a} ≠ ${b}`);
const normalized = s => close(s.reduce((sum, z) => sum + abs2(z), 0), 1);
const stateClose = (a, b) => a.forEach((z, i) => z.forEach((v, j) => close(v, b[i][j])));

test('Two-ion construction reproduces all four CNOT truth-table entries and resets the bus', () => {
  for (const [input, output] of [['00', 0], ['01', 1], ['10', 3], ['11', 2]]) {
    const r = simulateIons({ input });
    r.probabilities.forEach((p, i) => close(p, i === output ? 1 : 0));
    close(r.ground, 1); close(r.auxiliary, 0); close(r.fidelity, 1); normalized(r.state);
  }
});
test('Bell and uniform superpositions preserve correct relative phases, not just populations', () => {
  const bell = simulateIons();
  const expected = Array.from({ length: 12 }, () => [0, 0]);
  expected[0] = [Math.SQRT1_2, 0]; expected[6] = [Math.SQRT1_2, 0];
  stateClose(bell.state, expected);
  const uniform = simulateIons({ input: 'uniform' });
  [0, 2, 4, 6].forEach(i => stateClose([uniform.state[i]], [[.5, 0]]));
  const cz = simulateIons({ input: 'uniform', construction: 'cz' });
  [0, 2, 4, 6].forEach((i, j) => stateClose([cz.state[i]], [[j === 3 ? -.5 : .5, 0]]));
  close(cz.fidelity, 1);
});
test('Map / inverse map carry target information through the bus with textbook signs', () => {
  const mapped = simulateIons({ input: '01', construction: 'cz', progress: 2 });
  close(abs2(mapped.state[1]), 1); close(mapped.ground, 0);
  const phase = simulateIons({ input: '11', construction: 'cz', progress: 3 });
  stateClose([phase.state[5]], [[-1, 0]]);
  const restored = simulateIons({ input: '01', construction: 'cz', area: 0 });
  stateClose([restored.state[2]], [[1, 0]]);
});
test('Auxiliary π pulse leaves real leakage; 2π changes sign; 4π is identity', () => {
  const leak = simulateIons({ input: '11', construction: 'cz', area: PI, progress: 3 });
  close(leak.auxiliary, 1); close(abs2(leak.state[8]), 1); close(leak.fidelity, 0);
  for (const area of [0, 4 * PI]) {
    const r = simulateIons({ input: 'uniform', construction: 'cz', area });
    [0, 2, 4, 6].forEach(i => stateClose([r.state[i]], [[.5, 0]])); close(r.auxiliary, 0);
  }
});
test('All offered gate states remain normalized throughout complete and imperfect sequences', () => {
  for (const input of ['00', '01', '10', '11', 'plus0', 'plus1', 'uniform']) {
    for (const construction of ['cnot', 'cz']) for (const area of [0, .8, PI, 2 * PI, 3.4 * PI, 4 * PI]) {
      for (let progress = 0; progress <= 5; progress += .125) {
        const r = simulateIons({ input, construction, area, progress }); normalized(r.state);
        close(r.probabilities.reduce((s, p) => s + p, 0), 1);
        close(r.phonons.reduce((s, p) => s + p, 0), 1);
        close(r.auxiliary, r.state.reduce((sum, z, i) => sum + (ION_BASIS[i].control === 2 ? abs2(z) : 0), 0));
      }
    }
  }
});
test('Carrier matches Rx and laser-phase rotation without changing phonon populations', () => {
  const x = simulatePulse({ input: '00', kind: 'carrier', theta: PI / 2 });
  stateClose([x.state[0], x.state[4]], [[Math.SQRT1_2, 0], [0, -Math.SQRT1_2]]);
  const y = simulatePulse({ input: '00', kind: 'carrier', theta: PI / 2, phi: PI / 2 });
  stateClose([y.state[0], y.state[4]], [[Math.SQRT1_2, 0], [Math.SQRT1_2, 0]]);
  close(y.ground, 1); close(y.meanN, 0);
  const two = simulatePulse({ input: '02', kind: 'carrier', theta: 1.3 }); close(two.meanN, 2);
});
test('Sideband selection rules: red dark state, red exchange and blue pair creation', () => {
  for (const theta of [.4, PI, 4 * PI]) {
    stateClose(simulatePulse({ input: '00', kind: 'red', theta }).state, pulseInitial('00'));
  }
  const red = simulatePulse({ input: '10', kind: 'red', theta: PI });
  stateClose([red.state[1]], [[-1, 0]]); close(red.meanN, 1); close(red.excited, 0);
  const blue = simulatePulse({ input: '00', kind: 'blue', theta: PI });
  stateClose([blue.state[5]], [[1, 0]]); close(blue.meanN, 1); close(blue.excited, 1);
});
test('√n Rabi rate and η time scaling match analytic populations', () => {
  for (const theta of [.4, 1.2, PI, 2.7 * PI]) {
    const red = simulatePulse({ input: '02', kind: 'red', theta });
    close(red.excited, Math.sin(Math.sqrt(2) * theta / 2) ** 2);
    close(red.meanN, 2 - red.excited);
    const blue = simulatePulse({ input: '02', kind: 'blue', theta });
    close(blue.excited, Math.sin(Math.sqrt(3) * theta / 2) ** 2);
    close(blue.meanN, 2 + blue.excited); normalized(blue.state);
  }
  const a = simulatePulse({ eta: .1 }), b = simulatePulse({ eta: .2 });
  stateClose(a.state, b.state); close(a.duration, 2 * b.duration);
});
test('Pulse evolution is unitary and reverses on complex superpositions for every transition', () => {
  const initial = Array.from({ length: 8 }, (_, i) => [Math.cos(i + .3) / Math.sqrt(8), Math.sin(i + .3) / Math.sqrt(8)]);
  for (const kind of ['carrier', 'red', 'blue']) for (const theta of [0, .7, 3.5, 9]) for (const phi of [-.8, 0, 1.3]) {
    const evolved = pulseEvolution(initial, { kind, theta, phi }); normalized(evolved);
    stateClose(pulseEvolution(evolved, { kind, theta: -theta, phi }), initial);
  }
});
test('Single-ion phonon-controlled CNOT flips spin, preserving logical control order', () => {
  for (const [input, expected] of [['00', 0], ['01', 1], ['10', 3], ['11', 2]]) {
    const r = simulateSpin({ input }); r.probabilities.forEach((p, i) => close(p, i === expected ? 1 : 0));
    close(r.fidelity, 1); close(r.auxiliary, 0);
  }
  const bell = simulateSpin();
  stateClose(bell.state, [[Math.SQRT1_2, 0], [0, 0], [0, 0], [Math.SQRT1_2, 0], [0, 0], [0, 0]]);
});
test('Ramsey construction has the extra phonon phase described in the textbook', () => {
  const ramsey = simulateSpin({ construction: 'ramsey' });
  stateClose(ramsey.state, [[Math.SQRT1_2, 0], [0, 0], [0, 0], [-Math.SQRT1_2, 0], [0, 0], [0, 0]]);
  close(ramsey.fidelity, 1);
  close(fidelity(ramsey.state, simulateSpin().state), 0);
  for (const construction of ['cnot', 'ramsey', 'cz']) for (const area of [0, PI, 2 * PI, 4 * PI]) {
    for (let progress = 0; progress <= 3; progress += .125) normalized(simulateSpin({ construction, area, progress }).state);
  }
});
test('Invalid input and nonfinite parameters are rejected', () => {
  assert.throws(() => logicalInput('__proto__'), RangeError);
  assert.throws(() => simulateIons({ progress: NaN }), RangeError);
  assert.throws(() => simulateIons({ construction: 'other' }), RangeError);
  assert.throws(() => simulateSpin({ area: Infinity }), RangeError);
  assert.throws(() => simulatePulse({ kind: 'other' }), RangeError);
  assert.throws(() => simulatePulse({ eta: 0 }), RangeError);
});
