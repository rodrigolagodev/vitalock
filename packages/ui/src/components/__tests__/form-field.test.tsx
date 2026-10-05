import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FormField, Input, PasswordInput } from '@vitalock/ui';

describe('FormField', () => {
  it('binds the label to the control so it is the accessible name', () => {
    render(
      <FormField label="Correo">
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText('Correo');
    expect(input.tagName).toBe('INPUT');
    expect(screen.getByRole('textbox', { name: 'Correo' })).toBe(input);
  });

  it('uses an explicit id on the control when provided', () => {
    render(
      <FormField label="Correo" id="email">
        <Input />
      </FormField>,
    );
    expect(screen.getByLabelText('Correo')).toHaveAttribute('id', 'email');
  });

  it('adds no aria-invalid or aria-describedby without error or description', () => {
    render(
      <FormField label="Correo">
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText('Correo');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('flags the control invalid and announces the error with role=alert', () => {
    render(
      <FormField label="Correo" error="Ingresá un correo válido">
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText('Correo');
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Ingresá un correo válido');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toContain(alert.id);
  });

  it('links the description and preserves the child aria-describedby', () => {
    render(
      <FormField label="Correo" description="Usamos tu correo para ingresar" error="Obligatorio">
        <Input aria-describedby="external-hint" />
      </FormField>,
    );
    const input = screen.getByLabelText('Correo');
    const description = screen.getByText('Usamos tu correo para ingresar');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toEqual(['external-hint', description.id, screen.getByRole('alert').id]);
  });

  it('links only the description when there is no error', () => {
    render(
      <FormField label="Correo" description="Ayuda">
        <Input />
      </FormField>,
    );
    const input = screen.getByLabelText('Correo');
    expect(input).toHaveAttribute('aria-describedby', screen.getByText('Ayuda').id);
    expect(input).not.toHaveAttribute('aria-invalid');
  });

  it('keeps the ref of the child so react-hook-form register() still works', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <FormField label="Correo">
        <Input ref={ref} />
      </FormField>,
    );
    expect(ref.current).toBe(screen.getByLabelText('Correo'));
  });

  it('works with PasswordInput as the child', () => {
    render(
      <FormField label="Contraseña" error="Obligatoria">
        <PasswordInput />
      </FormField>,
    );
    const input = screen.getByLabelText('Contraseña');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
  describe('render-prop child', () => {
    it('hands id, no aria-invalid and no aria-describedby to a valid control', () => {
      render(
        <FormField label="Estado" id="estado">
          {(control) => <button type="button" {...control} />}
        </FormField>,
      );
      const control = screen.getByLabelText('Estado');
      expect(control).toHaveAttribute('id', 'estado');
      expect(control).not.toHaveAttribute('aria-invalid');
      expect(control).not.toHaveAttribute('aria-describedby');
    });

    it('marks the control invalid and references the role=alert message on error', () => {
      render(
        <FormField label="Estado" id="estado" error="Elegí un estado">
          {(control) => <button type="button" {...control} />}
        </FormField>,
      );
      const control = screen.getByLabelText('Estado');
      const alert = screen.getByRole('alert');
      expect(control).toHaveAttribute('aria-invalid', 'true');
      expect(alert).toHaveTextContent('Elegí un estado');
      expect(control.getAttribute('aria-describedby')).toContain(alert.id);
    });

    it('includes the description id in aria-describedby', () => {
      render(
        <FormField label="Estado" description="Ayuda">
          {(control) => <button type="button" {...control} />}
        </FormField>,
      );
      const control = screen.getByLabelText('Estado');
      expect(control.getAttribute('aria-describedby')).toBe(
        screen.getByText('Ayuda').getAttribute('id'),
      );
    });

    it('generates an id when none is given', () => {
      render(
        <FormField label="Estado">{(control) => <button type="button" {...control} />}</FormField>,
      );
      expect(screen.getByLabelText('Estado').id).not.toBe('');
    });
  });
});
