import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getTracer, traceSync, traceAsync } from './tracer';

// Vitest test env has import.meta.env.DEV = true by default

describe('tracer', () => {
  beforeEach(() => {
    performance.clearMarks();
    performance.clearMeasures();
  });

  describe('getTracer', () => {
    it('returns a tracer with the given name', () => {
      const tracer = getTracer('test-tracer');
      expect(tracer.name).toBe('test-tracer');
    });

    it('returns same instance for same name', () => {
      const a = getTracer('same');
      const b = getTracer('same');
      expect(a).toBe(b);
    });

    it('defaults name to spc-player', () => {
      const tracer = getTracer();
      expect(tracer.name).toBe('spc-player');
    });
  });

  describe('Span', () => {
    it('creates performance marks and measures', () => {
      const tracer = getTracer();
      const span = tracer.startSpan('test.span');
      const record = span.end();

      expect(record.name).toBe('test.span');
      expect(record.duration).toBeGreaterThanOrEqual(0);
      expect(record.startTime).toBeGreaterThanOrEqual(0);
    });

    it('records attributes', () => {
      const tracer = getTracer();
      const span = tracer.startSpan('test.attrs', { 'init.attr': 42 });
      span.setAttribute('added.attr', 'hello');
      const record = span.end();

      expect(record.attributes).toEqual({
        'init.attr': 42,
        'added.attr': 'hello',
      });
    });

    it('records status', () => {
      const tracer = getTracer();
      const span = tracer.startSpan('test.status');
      span.setStatus('ok');
      const record = span.end();

      expect(record.status).toBe('ok');
    });

    it('records error status with message', () => {
      const tracer = getTracer();
      const span = tracer.startSpan('test.error');
      span.setStatus('error', 'something broke');
      const record = span.end();

      expect(record.status).toBe('error');
      expect(record.error).toBe('something broke');
    });

    it('ignores mutations after end()', () => {
      const tracer = getTracer();
      const span = tracer.startSpan('test.ended');
      span.end();

      // These should be no-ops
      span.setAttribute('late', true);
      span.setStatus('error', 'too late');

      const record2 = span.end();
      expect(record2.attributes).not.toHaveProperty('late');
    });

    it('cleans up performance entries after end()', () => {
      const tracer = getTracer();
      const span = tracer.startSpan('test.cleanup');
      span.end();

      const marks = performance.getEntriesByName('test.cleanup::start');
      expect(marks).toHaveLength(0);
    });

    it('logs to console with group for spans with attributes', () => {
      const groupSpy = vi
        .spyOn(console, 'groupCollapsed')
        .mockImplementation(vi.fn());
      const tableSpy = vi.spyOn(console, 'table').mockImplementation(vi.fn());
      const groupEndSpy = vi
        .spyOn(console, 'groupEnd')
        .mockImplementation(vi.fn());

      const tracer = getTracer();
      const span = tracer.startSpan('test.log', { key: 'value' });
      span.setStatus('ok');
      span.end();

      expect(groupSpy).toHaveBeenCalledOnce();
      expect(tableSpy).toHaveBeenCalledWith({ key: 'value' });
      expect(groupEndSpy).toHaveBeenCalledOnce();

      groupSpy.mockRestore();
      tableSpy.mockRestore();
      groupEndSpy.mockRestore();
    });

    it('logs to console without group for spans without attributes', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());

      const tracer = getTracer();
      const span = tracer.startSpan('test.simple');
      span.setStatus('ok');
      span.end();

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[trace] test.simple'),
      );

      logSpy.mockRestore();
    });
  });

  describe('traceSync', () => {
    it('returns the function result', () => {
      const result = traceSync('test.sync', () => 42);
      expect(result).toBe(42);
    });

    it('propagates errors and records error status', () => {
      const consoleSpy = vi
        .spyOn(console, 'groupCollapsed')
        .mockImplementation(vi.fn());
      vi.spyOn(console, 'warn').mockImplementation(vi.fn());
      vi.spyOn(console, 'groupEnd').mockImplementation(vi.fn());

      expect(() =>
        traceSync('test.sync.error', () => {
          throw new Error('boom');
        }),
      ).toThrow('boom');

      consoleSpy.mockRestore();
      vi.restoreAllMocks();
    });

    it('passes attributes to the span', () => {
      const groupSpy = vi
        .spyOn(console, 'groupCollapsed')
        .mockImplementation(vi.fn());
      vi.spyOn(console, 'table').mockImplementation(vi.fn());
      vi.spyOn(console, 'groupEnd').mockImplementation(vi.fn());

      traceSync('test.sync.attrs', () => 'ok', { my: 'attr' });

      expect(groupSpy).toHaveBeenCalledWith(
        expect.stringContaining('test.sync.attrs'),
      );

      vi.restoreAllMocks();
    });
  });

  describe('traceAsync', () => {
    it('returns the async function result', async () => {
      const result = await traceAsync('test.async', () => Promise.resolve(99));
      expect(result).toBe(99);
    });

    it('propagates async errors and records error status', async () => {
      vi.spyOn(console, 'groupCollapsed').mockImplementation(vi.fn());
      vi.spyOn(console, 'warn').mockImplementation(vi.fn());
      vi.spyOn(console, 'groupEnd').mockImplementation(vi.fn());

      await expect(
        traceAsync('test.async.error', () =>
          Promise.reject(new Error('async boom')),
        ),
      ).rejects.toThrow('async boom');

      vi.restoreAllMocks();
    });

    it('measures async duration', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(vi.fn());

      await traceAsync(
        'test.async.duration',
        () => new Promise((r) => setTimeout(r, 10)),
      );

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('test.async.duration'),
      );

      logSpy.mockRestore();
    });
  });
});
