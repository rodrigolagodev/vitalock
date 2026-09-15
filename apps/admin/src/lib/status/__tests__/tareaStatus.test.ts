import { describe, it, expect } from 'vitest';
import { categoryIcon, categoryLabel } from '../tareaStatus';

describe('categoryLabel', () => {
  it('returns the human label for each known category', () => {
    expect(categoryLabel('install_equipment')).toBe('Instalación de equipo');
    expect(categoryLabel('replace_equipment')).toBe('Cambio de equipo');
    expect(categoryLabel('update_equipment')).toBe('Actualización de equipo');
    expect(categoryLabel('maintain_equipment')).toBe('Mantenimiento');
  });

  it('falls back to "Tarea" for an unknown category', () => {
    expect(categoryLabel('unknown_category')).toBe('Tarea');
  });
});

describe('categoryIcon', () => {
  it('returns a distinct icon component for each known category', () => {
    const icons = [
      categoryIcon('install_equipment'),
      categoryIcon('replace_equipment'),
      categoryIcon('update_equipment'),
      categoryIcon('maintain_equipment'),
    ];
    expect(new Set(icons).size).toBe(4);
  });

  it('falls back to the ClipboardList icon for an unknown category', () => {
    expect(categoryIcon('unknown_category')).toBe(categoryIcon('another_unknown'));
  });
});
