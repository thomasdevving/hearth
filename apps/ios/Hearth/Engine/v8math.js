// Bit-exact Math functions for JavaScriptCore.
//
// The engine's golden fixtures were produced by Node (V8). V8 computes Math.log, log10,
// exp, sin, cos and asin with its own port of fdlibm (src/base/ieee754.cc); JavaScriptCore
// calls the system libm. The two differ in the last bit for a few percent of inputs, which
// shows up in features such as location_entropy. This file is a JavaScript port of the
// same fdlibm routines and replaces those six functions before engine.js is loaded, so the
// iOS app computes exactly what the web app and the tests compute.
//
// This is adapter code (AGENTS.md §1.5): the engine itself is unchanged. With this file all
// golden fixtures match bit for bit in JavaScriptCore (HearthTests); without it 2 of 31 differ.
(function () {
  "use strict";
  var buf = new ArrayBuffer(8);
  var f64 = new Float64Array(buf);
  var u32 = new Uint32Array(buf); // little-endian: [0] = low word, [1] = high word

  function HI(x) { f64[0] = x; return u32[1] | 0; }
  function LO(x) { f64[0] = x; return u32[0] >>> 0; }
  function words(hi, lo) { u32[1] = hi >>> 0; u32[0] = lo >>> 0; return f64[0]; }
  function setHI(x, hi) { f64[0] = x; u32[1] = hi >>> 0; return f64[0]; }
  function setLO(x, lo) { f64[0] = x; u32[0] = lo >>> 0; return f64[0]; }

  var nativeSin = Math.sin, nativeCos = Math.cos;

  // ---------- log ----------
  var ln2_hi = 6.93147180369123816490e-01, ln2_lo = 1.90821492927058770002e-10,
    two54 = 1.80143985094819840000e+16,
    Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01,
    Lg3 = 2.857142874366239149e-01, Lg4 = 2.222219843214978396e-01,
    Lg5 = 1.818357216161805012e-01, Lg6 = 1.531383769920937332e-01,
    Lg7 = 1.479819860511658591e-01;

  function log(x) {
    x = +x;
    var hfsq, f, s, z, R, w, t1, t2, dk, k, hx, i, j, lx;
    hx = HI(x); lx = LO(x);
    k = 0;
    if (hx < 0x00100000) {
      if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
      if (hx < 0) return NaN;
      k -= 54;
      x *= two54;
      hx = HI(x);
    }
    if (hx >= 0x7ff00000) return x + x;
    k += (hx >> 20) - 1023;
    hx &= 0x000fffff;
    i = (hx + 0x95f64) & 0x100000;
    x = setHI(x, hx | (i ^ 0x3ff00000));
    k += i >> 20;
    f = x - 1.0;
    if ((0x000fffff & (2 + hx)) < 3) {
      if (f === 0) {
        if (k === 0) return 0;
        dk = k;
        return dk * ln2_hi + dk * ln2_lo;
      }
      R = f * f * (0.5 - 0.33333333333333333 * f);
      if (k === 0) return f - R;
      dk = k;
      return dk * ln2_hi - ((R - dk * ln2_lo) - f);
    }
    s = f / (2.0 + f);
    dk = k;
    z = s * s;
    i = hx - 0x6147a;
    w = z * z;
    j = 0x6b851 - hx;
    t1 = w * (Lg2 + w * (Lg4 + w * Lg6));
    t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
    i |= j;
    R = t2 + t1;
    if (i > 0) {
      hfsq = 0.5 * f * f;
      if (k === 0) return f - (hfsq - s * (hfsq + R));
      return dk * ln2_hi - ((hfsq - (s * (hfsq + R) + dk * ln2_lo)) - f);
    }
    if (k === 0) return f - s * (f - R);
    return dk * ln2_hi - ((s * (f - R) - dk * ln2_lo) - f);
  }

  // ---------- log10 ----------
  var ivln10 = 4.34294481903251816668e-01,
    log10_2hi = 3.01029995663611771306e-01,
    log10_2lo = 3.69423907715893078616e-13;

  function log10(x) {
    x = +x;
    var y, i, k, hx, lx;
    hx = HI(x); lx = LO(x);
    k = 0;
    if (hx < 0x00100000) {
      if (((hx & 0x7fffffff) | lx) === 0) return -Infinity;
      if (hx < 0) return NaN;
      k -= 54;
      x *= two54;
      hx = HI(x); lx = LO(x);
    }
    if (hx >= 0x7ff00000) return x + x;
    if (hx === 0x3ff00000 && lx === 0) return 0;
    k += (hx >> 20) - 1023;
    i = (k & 0x80000000) >>> 31;
    hx = (hx & 0x000fffff) | ((0x3ff - i) << 20);
    y = k + i;
    x = words(hx, lx);
    var z = y * log10_2lo + ivln10 * log(x);
    return z + y * log10_2hi;
  }

  // ---------- exp ----------
  var halF = [0.5, -0.5],
    o_threshold = 7.09782712893383973096e+02,
    u_threshold = -7.45133219101941108420e+02,
    ln2HI = [6.93147180369123816490e-01, -6.93147180369123816490e-01],
    ln2LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10],
    invln2 = 1.44269504088896338700e+00,
    P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03,
    P3 = 6.61375632143793436117e-05, P4 = -1.65339022054652515390e-06,
    P5 = 4.13813679705723846039e-08,
    E = 2.718281828459045,
    huge = 1.0e+300,
    twom1000 = 9.33263618503218878990e-302,
    two1023 = 8.988465674311579539e307;

  function exp(x) {
    x = +x;
    var y, hi = 0.0, lo = 0.0, c, t, twopk, k = 0, xsb, hx;
    hx = HI(x);
    xsb = (hx >>> 31) & 1;
    hx &= 0x7fffffff;
    if (hx >= 0x40862e42) {
      if (hx >= 0x7ff00000) {
        var lx = LO(x);
        if (((hx & 0xfffff) | lx) !== 0) return x + x;
        return xsb === 0 ? x : 0.0;
      }
      if (x > o_threshold) return Infinity;
      if (x < u_threshold) return 0;
    }
    if (hx > 0x3fd62e42) {
      if (hx < 0x3ff0a2b2) {
        if (x === 1.0) return E;
        hi = x - ln2HI[xsb];
        lo = ln2LO[xsb];
        k = 1 - xsb - xsb;
      } else {
        k = (invln2 * x + halF[xsb]) | 0;
        t = k;
        hi = x - t * ln2HI[0];
        lo = t * ln2LO[0];
      }
      x = hi - lo;
    } else if (hx < 0x3e300000) {
      if (huge + x > 1.0) return 1.0 + x;
    } else {
      k = 0;
    }
    t = x * x;
    if (k >= -1021) twopk = words(0x3ff00000 + (k << 20), 0);
    else twopk = words(0x3ff00000 + ((k + 1000) << 20), 0);
    c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
    if (k === 0) return 1.0 - ((x * c) / (c - 2.0) - x);
    y = 1.0 - ((lo - (x * c) / (2.0 - c)) - hi);
    if (k >= -1021) {
      if (k === 1024) return y * 2.0 * two1023;
      return y * twopk;
    }
    return y * twopk * twom1000;
  }

  // ---------- sin, cos ----------
  var S1 = -1.66666666666666324348e-01, S2 = 8.33333333332248946124e-03,
    S3 = -1.98412698298579493134e-04, S4 = 2.75573137070700676789e-06,
    S5 = -2.50507602534068634195e-08, S6 = 1.58969099521155010221e-10;

  function kernelSin(x, y, iy) {
    var z, r, v, ix;
    ix = HI(x) & 0x7fffffff;
    if (ix < 0x3e400000) {
      if ((x | 0) === 0) return x;
    }
    z = x * x;
    v = z * x;
    r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
    if (iy === 0) return x + v * (S1 + z * r);
    return x - ((z * (0.5 * y - v * r) - y) - v * S1);
  }

  var C1 = 4.16666666666666019037e-02, C2 = -1.38888888888741095749e-03,
    C3 = 2.48015872894767294178e-05, C4 = -2.75573143513906633035e-07,
    C5 = 2.08757232129817482790e-09, C6 = -1.13596475577881948265e-11;

  function kernelCos(x, y) {
    var a, iz, z, r, qx, ix;
    ix = HI(x) & 0x7fffffff;
    if (ix < 0x3e400000) {
      if ((x | 0) === 0) return 1.0;
    }
    z = x * x;
    r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
    if (ix < 0x3fd33333) return 1.0 - (0.5 * z - (z * r - x * y));
    if (ix > 0x3fe90000) qx = 0.28125;
    else qx = words(ix - 0x00200000, 0);
    iz = 0.5 * z - qx;
    a = 1.0 - qx;
    return a - (iz - (z * r - x * y));
  }

  var npio2_hw = [
    0x3ff921fb, 0x400921fb, 0x4012d97c, 0x401921fb, 0x401f6a7a, 0x4022d97c,
    0x4025fdbb, 0x402921fb, 0x402c463a, 0x402f6a7a, 0x4031475c, 0x4032d97c,
    0x40346b9c, 0x4035fdbb, 0x40378fdb, 0x403921fb, 0x403ab41b, 0x403c463a,
    0x403dd85a, 0x403f6a7a, 0x40407e4c, 0x4041475c, 0x4042106c, 0x4042d97c,
    0x4043a28c, 0x40446b9c, 0x404534ac, 0x4045fdbb, 0x4046c6cb, 0x40478fdb,
    0x404858eb, 0x404921fb,
  ];
  var invpio2 = 6.36619772367581382433e-01,
    pio2_1 = 1.57079632673412561417e+00, pio2_1t = 6.07710050650619224932e-11,
    pio2_2 = 6.07710050630396597660e-11, pio2_2t = 2.02226624879595063154e-21,
    pio2_3 = 2.02226624871116645580e-21, pio2_3t = 8.47842766036889956997e-32;

  // Returns n, writes the reduced argument to y[0], y[1]. Returns null for |x| > 2^19·π/2,
  // which the engine never uses (radians of latitude, longitude and 2π·u).
  function remPio2(x, y) {
    var z, w, t, r, fn, i, j, n, ix, hx, high;
    hx = HI(x);
    ix = hx & 0x7fffffff;
    if (ix <= 0x3fe921fb) { y[0] = x; y[1] = 0; return 0; }
    if (ix < 0x4002d97c) {
      if (hx > 0) {
        z = x - pio2_1;
        if (ix !== 0x3ff921fb) { y[0] = z - pio2_1t; y[1] = (z - y[0]) - pio2_1t; }
        else { z -= pio2_2; y[0] = z - pio2_2t; y[1] = (z - y[0]) - pio2_2t; }
        return 1;
      }
      z = x + pio2_1;
      if (ix !== 0x3ff921fb) { y[0] = z + pio2_1t; y[1] = (z - y[0]) + pio2_1t; }
      else { z += pio2_2; y[0] = z + pio2_2t; y[1] = (z - y[0]) + pio2_2t; }
      return -1;
    }
    if (ix <= 0x413921fb) {
      t = Math.abs(x);
      n = (t * invpio2 + 0.5) | 0;
      fn = n;
      r = t - fn * pio2_1;
      w = fn * pio2_1t;
      if (n < 32 && ix !== npio2_hw[n - 1]) {
        y[0] = r - w;
      } else {
        j = ix >> 20;
        y[0] = r - w;
        high = HI(y[0]);
        i = j - ((high >> 20) & 0x7ff);
        if (i > 16) {
          t = r;
          w = fn * pio2_2;
          r = t - w;
          w = fn * pio2_2t - ((t - r) - w);
          y[0] = r - w;
          high = HI(y[0]);
          i = j - ((high >> 20) & 0x7ff);
          if (i > 49) {
            t = r;
            w = fn * pio2_3;
            r = t - w;
            w = fn * pio2_3t - ((t - r) - w);
            y[0] = r - w;
          }
        }
      }
      y[1] = (r - y[0]) - w;
      if (hx < 0) { y[0] = -y[0]; y[1] = -y[1]; return -n; }
      return n;
    }
    return null;
  }

  var yy = [0, 0];
  function sin(x) {
    x = +x;
    var ix = HI(x) & 0x7fffffff;
    if (ix <= 0x3fe921fb) return kernelSin(x, 0, 0);
    if (ix >= 0x7ff00000) return x - x;
    var n = remPio2(x, yy);
    if (n === null) return nativeSin(x);
    switch (n & 3) {
      case 0: return kernelSin(yy[0], yy[1], 1);
      case 1: return kernelCos(yy[0], yy[1]);
      case 2: return -kernelSin(yy[0], yy[1], 1);
      default: return -kernelCos(yy[0], yy[1]);
    }
  }
  function cos(x) {
    x = +x;
    var ix = HI(x) & 0x7fffffff;
    if (ix <= 0x3fe921fb) return kernelCos(x, 0);
    if (ix >= 0x7ff00000) return x - x;
    var n = remPio2(x, yy);
    if (n === null) return nativeCos(x);
    switch (n & 3) {
      case 0: return kernelCos(yy[0], yy[1]);
      case 1: return -kernelSin(yy[0], yy[1], 1);
      case 2: return -kernelCos(yy[0], yy[1]);
      default: return kernelSin(yy[0], yy[1], 1);
    }
  }

  // ---------- asin ----------
  var pio2_hi = 1.57079632679489655800e+00, pio2_lo = 6.12323399573676603587e-17,
    pio4_hi = 7.85398163397448278999e-01,
    pS0 = 1.66666666666666657415e-01, pS1 = -3.25565818622400915405e-01,
    pS2 = 2.01212532134862925881e-01, pS3 = -4.00555345006794114027e-02,
    pS4 = 7.91534994289814532176e-04, pS5 = 3.47933107596021167570e-05,
    qS1 = -2.40339491173441421878e+00, qS2 = 2.02094576023350569471e+00,
    qS3 = -6.88283971605453293030e-01, qS4 = 7.70381505559019352791e-02;

  function asin(x) {
    x = +x;
    var t = 0, w, p, q, c, r, s, hx, ix;
    hx = HI(x);
    ix = hx & 0x7fffffff;
    if (ix >= 0x3ff00000) {
      var lx = LO(x);
      if (((ix - 0x3ff00000) | lx) === 0) return x * pio2_hi + x * pio2_lo;
      return NaN;
    } else if (ix < 0x3fe00000) {
      if (ix < 0x3e400000) {
        if (huge + x > 1.0) return x;
      } else {
        t = x * x;
      }
      p = t * (pS0 + t * (pS1 + t * (pS2 + t * (pS3 + t * (pS4 + t * pS5)))));
      q = 1.0 + t * (qS1 + t * (qS2 + t * (qS3 + t * qS4)));
      w = p / q;
      return x + x * w;
    }
    w = 1.0 - Math.abs(x);
    t = w * 0.5;
    p = t * (pS0 + t * (pS1 + t * (pS2 + t * (pS3 + t * (pS4 + t * pS5)))));
    q = 1.0 + t * (qS1 + t * (qS2 + t * (qS3 + t * qS4)));
    s = Math.sqrt(t);
    if (ix >= 0x3fef3333) {
      w = p / q;
      t = pio2_hi - (2.0 * (s + s * w) - pio2_lo);
    } else {
      w = setLO(s, 0);
      c = (t - w * w) / (s + w);
      r = p / q;
      p = 2.0 * s * r - (pio2_lo - 2.0 * c);
      q = pio4_hi - 2.0 * w;
      t = pio4_hi - (p - q);
    }
    return hx > 0 ? t : -t;
  }

  var fns = { log: log, log10: log10, exp: exp, sin: sin, cos: cos, asin: asin };
  if (typeof globalThis.__V8MATH_EXPORT === "object") {
    globalThis.__V8MATH_EXPORT.fns = fns; // test hook: compare without replacing
  } else {
    for (var k in fns) Math[k] = fns[k];
  }
})();
