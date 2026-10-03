import { afterEach, describe, expect, it, vi } from 'vitest';
import { addLogSink, resetLogSinks } from '../../logger/logger';
import { registerGlobalErrorHandlers } from '../globalErrorHandlers';

let unregister: (() => void) | undefined;

afterEach(() => {
  unregister?.();
  unregister = undefined;
  resetLogSinks();
});

function rejectionEvent(reason: unknown): Event {
  // jsdom has no PromiseRejectionEvent constructor; the handler only reads
  // `reason`, so a plain Event carrying it is equivalent.
  return Object.assign(new Event('unhandledrejection'), { reason });
}

describe('registerGlobalErrorHandlers', () => {
  it('forwards window error events to the logger, redacted', () => {
    const sink = vi.fn();
    addLogSink(sink);
    unregister = registerGlobalErrorHandlers('admin:global');

    window.dispatchEvent(
      new ErrorEvent('error', {
        error: new Error('boom for vecino@example.com'),
        message: 'boom',
      }),
    );

    expect(sink).toHaveBeenCalledTimes(1);
    const [level, tag, args] = sink.mock.calls[0] as [string, string, unknown[]];
    expect(level).toBe('error');
    expect(tag).toBe('admin:global');
    expect(args[0]).toBe('uncaught error');
    const payload = args[1] as { error: { message?: string } };
    expect(payload.error.message).toBe('boom for [email]');
  });

  it('falls back to the event message when error is null (cross-origin)', () => {
    const sink = vi.fn();
    addLogSink(sink);
    unregister = registerGlobalErrorHandlers();

    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));

    const payload = (sink.mock.calls[0] as [string, string, unknown[]])[2][1] as {
      error: { message?: string };
    };
    expect(payload.error.message).toBe('Script error.');
  });

  it('forwards unhandled promise rejections to the logger', () => {
    const sink = vi.fn();
    addLogSink(sink);
    unregister = registerGlobalErrorHandlers('installer:global');

    window.dispatchEvent(rejectionEvent({ code: '23505', message: 'duplicate' }));

    expect(sink).toHaveBeenCalledTimes(1);
    const [, tag, args] = sink.mock.calls[0] as [string, string, unknown[]];
    expect(tag).toBe('installer:global');
    expect(args[0]).toBe('unhandled promise rejection');
    expect((args[1] as { error: { code?: string } }).error.code).toBe('23505');
  });

  it('stops reporting after unregister', () => {
    const sink = vi.fn();
    addLogSink(sink);
    registerGlobalErrorHandlers()();

    // Message-only events: vitest reports an ErrorEvent carrying an `error`
    // as an uncaught exception when no app listener is attached.
    window.dispatchEvent(new ErrorEvent('error', { message: 'x' }));
    window.dispatchEvent(rejectionEvent('y'));

    expect(sink).not.toHaveBeenCalled();
  });
});
