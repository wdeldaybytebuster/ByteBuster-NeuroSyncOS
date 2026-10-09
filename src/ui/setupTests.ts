/**
 * Phase F-5 — global vitest setup (environment-agnostic).
 *
 * This file loads for EVERY test file (node- and jsdom-environment alike —
 * `setupFiles` is global), so it must not touch the DOM at import time and
 * must guard every DOM call. Under jsdom it registers React Testing
 * Library's cleanup so a mounted dashboard from one test cannot leak its DOM
 * into the next; under node it is a no-op.
 */
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  // RTL's cleanup is a DOM operation — no document under node env.
  if (typeof document !== 'undefined') {
    cleanup();
  }
});
