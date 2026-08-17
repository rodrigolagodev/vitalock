import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addLogSink,
  consoleSink,
  logger,
  resetLogSinks,
  type LogLevel,
} from './logger';

afterEach(() => {
  resetLogSinks();
  vi.restoreAllMocks();
});

describe('logger', () => {
  it('fans out to every registered sink with tag + level + args', () => {
    const sink = vi.fn();
    addLogSink(sink);

    logger('scope').warn('hello', { id: 1 });

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith('warn', 'scope', ['hello', { id: 1 }]);
  });

  it('emits nothing when no sinks are registered', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger('scope').warn('nope');
    expect(spy).not.toHaveBeenCalled();
  });

  it('addLogSink returns an unsubscribe that removes just that sink', () => {
    const a = vi.fn();
    const b = vi.fn();
    const off = addLogSink(a);
    addLogSink(b);

    off();
    logger('scope').info('x');

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it('all four levels route to the sink', () => {
    const sink = vi.fn();
    addLogSink(sink);
    const l = logger('t');
    l.debug('d');
    l.info('i');
    l.warn('w');
    l.error('e');
    const levels = sink.mock.calls.map((c) => c[0] as LogLevel);
    expect(levels).toEqual(['debug', 'info', 'warn', 'error']);
  });
});

describe('consoleSink', () => {
  it('forwards to matching console method in DEV (vitest is DEV)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleSink('warn', 'tag', ['msg']);
    expect(warn).toHaveBeenCalledWith('[tag]', 'msg');
  });

  it('maps debug to console.log', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleSink('debug', 'tag', ['msg']);
    expect(log).toHaveBeenCalledWith('[tag]', 'msg');
  });
});
