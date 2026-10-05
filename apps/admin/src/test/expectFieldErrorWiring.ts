import { expect } from 'vitest';
import { screen } from '@testing-library/react';

/**
 * After a failed submit: at least one `role="alert"` is shown, and the first
 * invalid control is `aria-invalid="true"` with an `aria-describedby` that
 * points at a `role="alert"` message (the FormField guarantee).
 */
export function expectInvalidFieldWired(root: ParentNode = document) {
  expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  const invalid = root.querySelector('[aria-invalid="true"]');
  expect(invalid).not.toBeNull();
  const describedBy = (invalid?.getAttribute('aria-describedby') ?? '').split(' ');
  const messages = describedBy
    .map((id) => document.getElementById(id))
    .filter((el): el is HTMLElement => el !== null);
  expect(messages.some((el) => el.getAttribute('role') === 'alert')).toBe(true);
}
