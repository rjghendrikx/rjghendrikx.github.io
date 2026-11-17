// beat.js — BPM and beat phase from the microphone, as a pure tracker plus a mic opener.
//
// Onset strength: spectral flux over 12 log-spaced bands (40 Hz – 8 kHz) from a 1024-point
// FFT every 256-sample block (5.3 ms at 48 kHz), log-compressed so a sustained bass does not
// drown the kick, normalised by a slow running mean so loud and quiet rooms behave alike.
// Tempo: autocorrelation of the onset envelope over the last 6 s, 70–180 BPM, with harmonic
// summation (acf at 2× and 3× the lag) against half/double-tempo errors and a log-Gaussian
// prior on the current estimate; a new tempo must beat the current one by 25 % for six updates
// of 0.25 s. Octave choice (85 vs 170) stays ambiguous by nature: `;` halves, `'` doubles. Phase: the comb
// offset that collects the most recent onset energy on the beat grid. Beat-level only: the
// downbeat is the operator's Enter key. Measured on synthetic material; a real room is
// unmeasured (see web/README.md).

const BANDS = 12, F_LO = 40, F_HI = 8000;

function fftRadix2(re, im) {                            // in-place, n a power of two
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

export class BeatTracker {
  constructor({ hop = 256 / 48000, window = 6, minBpm = 70, maxBpm = 180, prior = 128, fft = 1024 } = {}) {
    this.opts = { window, minBpm, maxBpm };
    this.hop = hop; this.n = Math.round(window / hop);
    this.ring = new Float32Array(this.n);
    this.lastBin = -1;
    this.minLag = Math.round(60 / maxBpm / hop); this.maxLag = Math.round(60 / minBpm / hop);
    this.bpm = prior; this.locked = false; this.confidence = 0; this.lastBeat = null; this.period = 60 / prior;
    this.candidate = null; this.candidateRuns = 0; this.nextUpdate = 0; this.silence = 0;
    this.hist = []; this.stability = 0; this.quality = 0;
    this.fftN = fft; this.buf = new Float32Array(fft); this.re = new Float32Array(fft); this.im = new Float32Array(fft);
    this.win = Float32Array.from({ length: fft }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / fft));
    this.bandE = new Float32Array(BANDS).fill(-12); this.edges = null; this.norm = 1; this.lastFlux = 0;
  }

  // One audio block on the audio clock -> onset strength (spectral flux over log bands).
  block(x, sampleRate) {
    const N = this.fftN;
    if (!this.edges && Math.abs(x.length / sampleRate - this.hop) > 1e-9) this._rehop(x.length / sampleRate);
    this.buf.copyWithin(0, x.length); this.buf.set(x, N - x.length);
    if (!this.edges) {
      this.edges = Float32Array.from({ length: BANDS + 1 }, (_, b) => Math.round(F_LO * (F_HI / F_LO) ** (b / BANDS) / (sampleRate / N)));
    }
    for (let i = 0; i < N; i++) { this.re[i] = this.buf[i] * this.win[i]; this.im[i] = 0; }
    fftRadix2(this.re, this.im);
    let flux = 0;
    for (let b = 0; b < BANDS; b++) {
      let e = 0;
      for (let k = Math.max(1, this.edges[b]); k < Math.max(this.edges[b] + 1, this.edges[b + 1]); k++) e += this.re[k] * this.re[k] + this.im[k] * this.im[k];
      const le = Math.log(e + 1e-9);
      const d = le - this.bandE[b];
      if (d > 0) flux += d * (b >= 1 && b <= 3 ? 2 : 1);   // 65–300 Hz: the kick's punch, not the sub
      this.bandE[b] = le;
    }
    this.norm += 0.002 * (flux - this.norm);               // slow mean (~2.5 s): gain-independent
    this.lastFlux = flux / (this.norm + 1e-6);
    return this.lastFlux;
  }

  // one bin per audio block: a 5 ms bin grid against 5.33 ms blocks left every 16th bin empty
  _rehop(hop) {
    const { window, minBpm, maxBpm } = this.opts;
    this.hop = hop; this.n = Math.round(window / hop); this.ring = new Float32Array(this.n);
    this.minLag = Math.round(60 / maxBpm / hop); this.maxLag = Math.round(60 / minBpm / hop);
  }

  push(flux, time) {
    const bin = Math.floor(time / this.hop);
    if (this.lastBin < 0) this.lastBin = bin - 1;
    for (let b = this.lastBin + 1; b < bin; b++) this.ring[b % this.n] = 0;   // skipped bins
    if (bin > this.lastBin) { this.ring[bin % this.n] = flux; this.lastBin = bin; }
    else this.ring[bin % this.n] = Math.max(this.ring[bin % this.n], flux);
  }

  // Call regularly with the audio clock; recomputes every 0.25 s. Returns the status.
  update(now) {
    if (now < this.nextUpdate || this.lastBin < this.n / 2) return this.status();
    this.nextUpdate = now + 0.25;
    const env = new Float32Array(this.n);
    let mean = 0;
    for (let i = 0; i < this.n; i++) { env[i] = this.ring[(this.lastBin - this.n + 1 + i + this.n * 4) % this.n]; mean += env[i]; }
    mean /= this.n;
    let energy = 0;
    for (let i = 0; i < this.n; i++) { env[i] -= mean; energy += env[i] * env[i]; }
    if (energy < 1e-6) { if (++this.silence > 8) this.locked = false; return this.status(); }
    this.silence = 0;
    const acf = new Float32Array(3 * this.maxLag + 2);
    for (let lag = this.minLag - 1; lag < acf.length && lag < this.n / 2; lag++) {
      let s = 0;
      for (let i = lag; i < this.n; i++) s += env[i] * env[i - lag];
      acf[lag] = s / (this.n - lag);
    }
    const sigma = this.locked ? 0.15 : 0.5;                 // octaves
    let best = -Infinity, bestLag = 0, bestRaw = 0, atCurrent = 0;
    const curLag = Math.round(this.period / this.hop);
    for (let lag = this.minLag; lag <= this.maxLag; lag++) {
      const bpm = 60 / (lag * this.hop);
      const w = Math.exp(-0.5 * (Math.log2(bpm / this.bpm) / sigma) ** 2);
      const harm = acf[lag] + 0.5 * (acf[2 * lag] || 0) + 0.33 * (acf[3 * lag] || 0);
      const score = harm * (0.3 + 0.7 * w);
      if (Math.abs(lag - curLag) <= 1) atCurrent = Math.max(atCurrent, score);
      if (score > best) { best = score; bestLag = lag; bestRaw = acf[lag]; }
    }
    // a different tempo (3:2, 2:1 ...) has to beat the current one by a margin, for six updates
    if (this.locked && Math.abs(Math.log2(60 / (bestLag * this.hop) / this.bpm)) >= 0.025 && best < 1.25 * atCurrent) {
      bestLag = curLag; bestRaw = acf[curLag] || 0;
    }
    const a = acf[bestLag - 1], b = acf[bestLag], c = acf[bestLag + 1];
    const shift = (a - c) / (2 * (a - 2 * b + c) || 1);   // parabolic refinement
    const lag = bestLag + Math.max(-0.5, Math.min(0.5, shift));
    const bpm = 60 / (lag * this.hop);
    const conf = Math.max(0, bestRaw / (energy / this.n));  // 0..1: how periodic the envelope is
    if (Math.abs(Math.log2(bpm / this.bpm)) < 0.025) { this.bpm = 0.75 * this.bpm + 0.25 * bpm; this.candidateRuns = 0; }
    else if (this.candidate && Math.abs(Math.log2(bpm / this.candidate)) < 0.025) {
      if (++this.candidateRuns >= 6) { this.bpm = bpm; this.candidate = null; this.candidateRuns = 0; }
    } else { this.candidate = bpm; this.candidateRuns = 1; }
    this.period = 60 / this.bpm;
    const P = this.period / this.hop;
    let pb = -Infinity, po = 0, psum = 0;
    const steps = Math.max(8, Math.round(P));
    for (let s = 0; s < steps; s++) {
      const o = (s / steps) * P;
      let acc = 0;
      for (let k = 0; ; k++) {
        const j = this.n - 1 - Math.round(o + k * P);
        if (j < 0) break;
        acc += env[j] * Math.pow(0.5, (this.n - 1 - j) * this.hop / 3);
      }
      psum += Math.max(acc, 0);
      if (acc > pb) { pb = acc; po = o; }
    }
    const contrast = psum > 0 ? pb / (psum / steps) : 0;
    const beat = (this.lastBin - po) * this.hop;
    if (this.lastBeat === null || !this.locked) this.lastBeat = beat;
    else {                                                   // small corrections only: no jumps once locked
      let d = (beat - this.lastBeat) / this.period; d -= Math.round(d);
      this.lastBeat += 0.35 * d * this.period;
      const n = Math.floor((beat - this.lastBeat) / this.period + 0.5);
      this.lastBeat += n * this.period;
    }
    this.confidence = Math.min(1, 0.6 * conf + 0.4 * Math.min(1, (contrast - 1) / 3));
    // stability: the tempo of the last 4 s must agree within ~2 %; a wandering estimate (beatless
    // passages, breakdowns) is not a lock, so the page holds its last good tempo instead of following
    this.hist.push(this.bpm); if (this.hist.length > 16) this.hist.shift();
    const hm = this.hist.reduce((a, v) => a + v, 0) / this.hist.length;
    const hs = Math.sqrt(this.hist.reduce((a, v) => a + (v - hm) ** 2, 0) / this.hist.length) / hm;
    this.stability = this.hist.length < 8 ? 0 : Math.max(0, Math.min(1, 1 - hs / 0.02));
    this.locked = this.confidence > 0.25 && this.stability > 0.5;
    // display: raw confidence of a correct lock on dense techno sits at 0.45–0.7 (16th hats keep the
    // normalised autocorrelation low), so it is rescaled 0.2 → 0, 0.6 → 1, and multiplied by stability
    this.quality = Math.max(0, Math.min(1, (this.confidence - 0.2) / 0.4)) * this.stability;
    return this.status();
  }

  // Operator override for the octave: multiply the tempo by 2 or 0.5 and keep the beat grid.
  octave(factor) {
    const bpm = this.bpm * factor;
    if (bpm < 60 / (this.maxLag * this.hop) || bpm > 60 / (this.minLag * this.hop)) return;
    this.bpm = bpm; this.period = 60 / bpm; this.candidate = null; this.candidateRuns = 0; this.hist = this.hist.map((v) => v * factor);
  }

  // Fractional beat phase (0..1) the music is at, at audio time `time`; null before lock.
  phaseAt(time) {
    if (this.lastBeat === null) return null;
    const x = (time - this.lastBeat) / this.period;
    return x - Math.floor(x);
  }

  status() {
    return { bpm: this.bpm, locked: this.locked, confidence: this.confidence, stability: this.stability, quality: this.quality, lastBeat: this.lastBeat,
             flux: this.lastFlux, filled: this.lastBin >= this.n / 2 };
  }
}

// List audio inputs (labels appear after the first permission).
export async function listInputs() {
  const devs = await navigator.mediaDevices.enumerateDevices();
  return devs.filter((d) => d.kind === 'audioinput').map((d) => ({ id: d.deviceId, label: d.label || 'input' }));
}

// Open an audio input without Chrome's voice processing (it flattens exactly the transients a
// beat tracker needs). `deviceId` picks a specific input, e.g. a loopback device (BlackHole)
// for internal routing instead of the microphone; stereo inputs are mixed to mono. Audio blocks of 256 samples are timestamped
// on the audio clock and queued; the page drains the queue into the tracker each frame. A
// ScriptProcessorNode is deprecated but exact and dependency-free; an AudioWorklet is the
// upgrade path. Polling an AnalyserNode from requestAnimationFrame quantised onsets to the
// 16.7 ms frame grid and biased 132 BPM to 133.3 (measured with the click-track test).
export async function openMic(tracker, deviceId = null) {
  const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } };
  if (deviceId) audio.deviceId = { exact: deviceId };
  const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
  const ctx = new AudioContext();
  await ctx.resume();
  const proc = ctx.createScriptProcessor(256, 2, 1);
  const mute = ctx.createGain(); mute.gain.value = 0;      // the node must reach the destination to run
  ctx.createMediaStreamSource(stream).connect(proc); proc.connect(mute); mute.connect(ctx.destination);
  const queue = [], mono = new Float32Array(256);
  proc.onaudioprocess = (e) => {                           // mix to mono: a loopback (BlackHole) is stereo
    const ib = e.inputBuffer, l = ib.getChannelData(0), r = ib.numberOfChannels > 1 ? ib.getChannelData(1) : l;
    for (let i = 0; i < l.length; i++) mono[i] = 0.5 * (l[i] + r[i]);
    queue.push([tracker.block(mono, ctx.sampleRate), e.playbackTime]);
  };
  return {
    ctx, label: stream.getAudioTracks()[0]?.label || 'input',
    drain() { for (const [flux, t] of queue) tracker.push(flux, t); queue.length = 0; },
    close() { proc.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close(); },
  };
}
