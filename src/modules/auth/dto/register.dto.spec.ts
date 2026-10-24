import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto } from './register.dto';

const valid = {
  userName: 'ivan_1',
  firstName: 'Ivan',
  lastName: 'Petrenko',
  email: 'ivan@example.com',
  phone: '+380671234567',
  password: 'password123',
};

// Mirrors ValidationPipe: transform first (applies @Transform), then validate.
const check = async (override: Record<string, unknown>) => {
  const dto = plainToInstance(RegisterDto, { ...valid, ...override });
  const errors = await validate(dto);
  return { dto, fields: errors.map((e) => e.property) };
};

describe('RegisterDto', () => {
  it('accepts a valid body', async () => {
    expect((await check({})).fields).toEqual([]);
  });

  it('rejects a userName with spaces or symbols', async () => {
    expect((await check({ userName: 'bad name!' })).fields).toEqual(['userName']);
  });

  it('rejects a userName longer than 30 characters', async () => {
    expect((await check({ userName: 'a'.repeat(31) })).fields).toEqual(['userName']);
  });

  it('trims and lowercases the email before validation', async () => {
    const { dto, fields } = await check({ email: '  Ivan@Example.COM ' });
    expect(fields).toEqual([]);
    expect(dto.email).toBe('ivan@example.com');
  });

  it('requires both a letter and a digit in the password', async () => {
    expect((await check({ password: '12345678' })).fields).toEqual(['password']);
    expect((await check({ password: 'abcdefgh' })).fields).toEqual(['password']);
  });

  it('rejects a password longer than 72 characters', async () => {
    expect((await check({ password: 'a1'.repeat(37) })).fields).toEqual(['password']);
  });
});
