# Ion trap simulator for quantum computation

A browser simulator of the ideal trapped-ion quantum gate mechanisms in Nielsen & Chuang, *Quantum Computation and Quantum Information*, §7.6 (pp. 309–324).

The HTML/CSS follows the companion `harmonic-oscillator-quantum-computer`, `optical-photon-quantum-computer`, and `optical-cavity-qed-quantum-computer` projects: dark panels, blue/green/violet readouts, interactive controls and complex state amplitudes. The interface is English, consistent with those simulators. 

## Experiments

1. **Ion–ion quantum gate (§7.6.3):** CNOT or CZ using the target-to-bus mapping, a control-ion auxiliary pulse, and the inverse map. Follow all five blocks, inspect the midpoint of the auxiliary cycle, or play the sequence. The default `|+0⟩` input gives a Bell state with the bus returned to `|0⟩`.
2. **Carrier & sidebands (§7.6.2):** resonant carrier, red-sideband and blue-sideband pulses. Vary pulse area, laser phase and the Lamb–Dicke parameter. Observe dark states, spin–motion exchange, and the √n dependence of Rabi frequencies.
3. **Spin–phonon gate (§7.6.4):** one ion with motional control and internal-spin target. Compare exact CNOT, CZ, and the textbook Ramsey sequence. The latter is controlled(−X), differing from exact CNOT by a Z phase on the phonon qubit.

Every mode displays full complex amplitudes, phase dials, phonon populations, measurement probabilities and a parameter/sequence sweep. Settings are retained while switching experiments; reset restores the current experiment's defaults. Tabs support Left/Right/Home/End keys, and standard controls support keyboard input. Playback pauses when the page is hidden.

## Model conventions

- Ion–ion logical order is `|control, target⟩`; full amplitudes are `|control target, n⟩`. The initial bus is `n = 0`. Its 12-dimensional state includes a control-ion auxiliary level `a` and bus `n = 0,1`.
- Eq. (7.126) maps the **target** to the bus. The red-sideband map uses phase π to reproduce the signs of Eq. (7.125); the inverse reverses its angle. Applying the same map twice would leave an unwanted sign.
- Single-ion physical states use `|spin,n⟩`. Spin–phonon **logical** inputs and probability bars use `|phonon,spin⟩`, with phonon as control. The offered sideband inputs reach at most `n = 3`; all populated transitions fit in the retained basis.
- Carrier `θ = Ωt`; sideband `θ = ηΩt`, before the √n factors. At fixed sideband area, η changes the duration rather than the state. Ω is the effective addressed-ion coupling, including collective normalization where applicable.
- The auxiliary transition `|1,1⟩ ↔ |a,0⟩` uses a Hermitian two-state resonant Hamiltonian. Area 2π returns with phase −1; π leaves the coupled branch in the auxiliary level; 4π gives no sign change. Leaked population is retained without renormalization or postselection.
- Sequence progress is a normalized block coordinate, **not laboratory time**. The Hadamard blocks are ideal composite carrier operations with a continuous `H^f` interpolation for visualization.
- Fidelity is `|⟨ψideal final|ψcurrent⟩|²`, including the bus and auxiliary state. It is input-state fidelity, not average gate fidelity.

The simulator assumes resonant rotating-wave and first-order Lamb–Dicke approximations, ideal state preparation and selective addressing. It omits heating, dephasing, spontaneous emission, other motional modes and micromotion. The single-ion experiment and ideal two-ion construction are separate models; no modern hardware performance is implied.
