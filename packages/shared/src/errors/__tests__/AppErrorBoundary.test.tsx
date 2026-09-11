import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useState } from 'react';
import type { JSX } from 'react';
import { addLogSink, resetLogSinks } from '../../logger/logger';
import { AppErrorBoundary, RouteBoundaryLayout } from '../AppErrorBoundary';

// React logs caught render errors to console.error; silence it so the run
// output stays readable.
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  resetLogSinks();
  consoleError.mockRestore();
  vi.restoreAllMocks();
});

function Boom({ shouldThrow = true }: { shouldThrow?: boolean }): JSX.Element {
  if (shouldThrow) throw new Error('exploded on render');
  return <p>contenido ok</p>;
}

function fallback({ reset }: { reset: () => void }) {
  return (
    <div>
      <p>Ocurrió un error</p>
      <button type="button" onClick={reset}>
        Reintentar
      </button>
    </div>
  );
}

describe('AppErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <AppErrorBoundary>
        <Boom shouldThrow={false} />
      </AppErrorBoundary>,
    );
    expect(screen.getByText('contenido ok')).not.toBeNull();
  });

  it('renders the default fallback when a child throws', () => {
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert')).not.toBeNull();
    expect(screen.getByText('Ocurrió un error inesperado. Intentá de nuevo.')).not.toBeNull();
  });

  it('renders a custom fallback render prop with the error and a reset', () => {
    render(
      <AppErrorBoundary fallback={({ error }) => <p>fallback: {error.message}</p>}>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(screen.getByText('fallback: exploded on render')).not.toBeNull();
  });

  it('reports the error and componentStack through the logger at error level', () => {
    const sink = vi.fn();
    addLogSink(sink);

    render(
      <AppErrorBoundary tag="admin-root">
        <Boom />
      </AppErrorBoundary>,
    );

    expect(sink).toHaveBeenCalled();
    const call = sink.mock.calls.find((c) => c[0] === 'error');
    expect(call).toBeDefined();
    const [level, tag, args] = call as [string, string, unknown[]];
    expect(level).toBe('error');
    expect(tag).toBe('admin-root');
    expect(args[0]).toBe('render error');
    const payload = args[1] as { error: { message?: string }; componentStack: string | null };
    expect(payload.error.message).toBe('exploded on render');
    expect(typeof payload.componentStack).toBe('string');
    expect(payload.componentStack).toContain('Boom');
  });

  it('calls the optional onError hook with the error', () => {
    const onError = vi.fn();
    render(
      <AppErrorBoundary onError={onError}>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe('exploded on render');
  });

  it('reset clears the error, calls onReset, and re-renders children', () => {
    const onReset = vi.fn();

    function Harness() {
      const [broken, setBroken] = useState(true);
      return (
        <AppErrorBoundary
          onReset={() => {
            setBroken(false);
            onReset();
          }}
          fallback={fallback}
        >
          <Boom shouldThrow={broken} />
        </AppErrorBoundary>
      );
    }

    render(<Harness />);
    expect(screen.getByText('Ocurrió un error')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText('contenido ok')).not.toBeNull();
  });

  it('clears the error when a resetKey changes', () => {
    function Harness() {
      const [key, setKey] = useState('a');
      return (
        <div>
          <button type="button" onClick={() => setKey('b')}>
            cambiar
          </button>
          <AppErrorBoundary resetKeys={[key]} fallback={fallback}>
            <Boom shouldThrow={key === 'a'} />
          </AppErrorBoundary>
        </div>
      );
    }

    render(<Harness />);
    expect(screen.getByText('Ocurrió un error')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'cambiar' }));

    expect(screen.getByText('contenido ok')).not.toBeNull();
  });

  it('keeps showing the fallback while resetKeys are unchanged', () => {
    function Harness() {
      const [, setTick] = useState(0);
      return (
        <div>
          <button type="button" onClick={() => setTick((t) => t + 1)}>
            tick
          </button>
          <AppErrorBoundary resetKeys={['stable']} fallback={fallback}>
            <Boom />
          </AppErrorBoundary>
        </div>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'tick' }));
    expect(screen.getByText('Ocurrió un error')).not.toBeNull();
  });
});

describe('RouteBoundaryLayout', () => {
  it('isolates a crashing page while the shell keeps rendering', () => {
    render(
      <MemoryRouter initialEntries={['/roto']}>
        <Routes>
          <Route
            element={
              <div>
                <p>shell</p>
                <RouteBoundaryLayout fallback={fallback} />
              </div>
            }
          >
            <Route path="/roto" element={<Boom />} />
            <Route path="/ok" element={<p>página ok</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('shell')).not.toBeNull();
    expect(screen.getByText('Ocurrió un error')).not.toBeNull();
  });
});
