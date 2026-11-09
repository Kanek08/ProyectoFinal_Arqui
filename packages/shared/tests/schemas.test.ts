import { describe, expect, it } from 'vitest';
import { createSpaceSchema, registerSchema, updateSpaceSchema } from '../src';

describe('esquemas compartidos', () => {
  it('normaliza el correo en el registro', () => {
    const parsed = registerSchema.parse({ name: 'Ana', email: '  ANA@Mail.com ', password: 'Password123!' });
    expect(parsed.email).toBe('ana@mail.com');
  });

  it('rechaza un espacio cuyo horario cierra antes de abrir', () => {
    const result = createSpaceSchema.safeParse({
      name: 'Lab 1',
      building: 'A',
      capacity: 30,
      openTime: '18:00',
      closeTime: '07:00',
    });
    expect(result.success).toBe(false);
  });

  it('rechaza una actualización vacía', () => {
    expect(updateSpaceSchema.safeParse({}).success).toBe(false);
  });
});
