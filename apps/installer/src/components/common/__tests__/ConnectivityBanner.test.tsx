import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectivityBanner } from '../ConnectivityBanner';

const { useOnlineStatusMock } = vi.hoisted(() => ({ useOnlineStatusMock: vi.fn() }));

vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: useOnlineStatusMock }));

describe('ConnectivityBanner', () => {
  it('renders nothing while online', () => {
    useOnlineStatusMock.mockReturnValue(true);
    const { container } = render(<ConnectivityBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces an offline alert when the device loses connectivity', () => {
    useOnlineStatusMock.mockReturnValue(false);
    render(<ConnectivityBanner />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Sin conexión. Los datos pueden estar desactualizados.',
    );
  });
});
