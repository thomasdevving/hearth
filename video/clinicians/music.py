"""Calm ambient background music for the clinician video, made from scratch (no samples, no
licence questions). Soft chord pads in D major with a few sparse bell-like notes and a long
reverb. Deterministic: the same seconds give the same file.

    python3 video/clinicians/music.py <seconds> <out.wav>
"""
import sys
import wave

import numpy as np

SR = 44100
rng = np.random.default_rng(7)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# Dmaj9, Bm9, Gmaj9, Asus2: open voicings, one chord every 8 seconds.
CHORDS = [
    [50, 57, 62, 66, 69, 76],
    [47, 54, 61, 62, 66, 73],
    [43, 50, 57, 59, 66, 69],
    [45, 52, 57, 59, 64, 71],
]
CHORD_LEN = 8.0


def envelope(n, attack, release):
    env = np.ones(n)
    a, r = int(attack * SR), int(release * SR)
    env[:a] = np.linspace(0, 1, a) ** 2
    env[-r:] *= np.linspace(1, 0, r) ** 2
    return env


def pad(midi, dur):
    t = np.arange(int(dur * SR)) / SR
    f = hz(midi)
    out = np.zeros_like(t)
    for detune, amp in ((-0.12, 0.5), (0.0, 1.0), (0.11, 0.5)):
        ff = f * 2 ** (detune / 12)
        out += amp * (np.sin(2 * np.pi * ff * t) + 0.18 * np.sin(2 * np.pi * 2 * ff * t))
    out *= 1 + 0.08 * np.sin(2 * np.pi * 0.11 * t + rng.uniform(0, 6))  # slow breathing
    return out * envelope(len(t), 2.6, 3.2)


def bell(midi, dur=4.5):
    t = np.arange(int(dur * SR)) / SR
    f = hz(midi)
    tone = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3.01 * f * t)
    return tone * np.exp(-t * 1.4) * envelope(len(t), 0.008, 0.6)


def lowpass(x, cutoff):
    """Gentle 12 dB/octave roll-off, applied in the frequency domain."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(spec / (1 + (f / cutoff) ** 2), len(x))


def reverb(x, seconds=3.2, mix=0.38):
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * 2.2)
    ir[0] = 0
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    wet /= np.max(np.abs(wet)) + 1e-9
    dry = x / (np.max(np.abs(x)) + 1e-9)
    return (1 - mix) * dry + mix * wet


def add(buf, i, x):
    """Adds x into buf from sample i on, cutting off whatever runs past the end."""
    seg = buf[i : i + len(x)]
    seg += x[: len(seg)]


def render(total):
    n = int(total * SR)
    left, right = np.zeros(n + SR * 6), np.zeros(n + SR * 6)
    t0, k = 0.0, 0
    while t0 < total:
        chord = CHORDS[k % len(CHORDS)]
        for m in chord:
            p = pad(m, CHORD_LEN + 3.0) * 0.07
            i = int(t0 * SR)
            pan = rng.uniform(0.35, 0.65)
            add(left, i, p * (1 - pan))
            add(right, i, p * pan)
        # two or three bell notes per chord, from the chord's upper tones, an octave up
        for j in range(rng.integers(2, 4)):
            m = int(rng.choice(chord[2:])) + 12
            at = t0 + 1.2 + j * rng.uniform(1.8, 2.6)
            b = bell(m) * 0.05
            i = int(at * SR)
            pan = rng.uniform(0.25, 0.75)
            add(left, i, b * (1 - pan))
            add(right, i, b * pan)
        t0 += CHORD_LEN
        k += 1
    out = []
    for ch in (left[:n], right[:n]):
        ch = lowpass(ch, 2400)
        ch = reverb(ch)
        out.append(ch)
    stereo = np.stack(out, axis=1)
    fade_in, fade_out = int(3 * SR), int(5 * SR)
    stereo[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    stereo[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None] ** 1.5
    stereo /= np.max(np.abs(stereo)) + 1e-9
    return (stereo * 0.89 * 32767).astype(np.int16)


if __name__ == "__main__":
    seconds, path = float(sys.argv[1]), sys.argv[2]
    data = render(seconds)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())
    print("wrote", path, f"{seconds:.0f} s")
