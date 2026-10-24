import { ArgumentsHost, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AllExceptionsFilter } from './all-exceptions.filter';

const run = (exception: unknown) => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'POST', url: '/api/x' }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;

  new AllExceptionsFilter().catch(exception, host);

  return {
    status: status.mock.calls[0][0] as number,
    body: json.mock.calls[0][0] as Record<string, unknown>,
  };
};

describe('AllExceptionsFilter', () => {
  it('keeps validation messages as an array', () => {
    const { status, body } = run(new BadRequestException(['email must be an email', 'too short']));
    expect(status).toBe(400);
    expect(body.message).toEqual(['email must be an email', 'too short']);
    expect(body.error).toBe('Bad Request');
  });

  it('wraps a plain string message into an array', () => {
    const { status, body } = run(new NotFoundException('User 1 not found'));
    expect(status).toBe(404);
    expect(body.message).toEqual(['User 1 not found']);
  });

  it('maps a unique violation to 409', () => {
    const driverError = Object.assign(new Error('duplicate key'), { code: '23505' });
    const { status } = run(new QueryFailedError('INSERT', [], driverError));
    expect(status).toBe(409);
  });

  it('hides unexpected errors behind a generic 500', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { status, body } = run(new Error('db password is hunter2'));
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(body.message).toEqual(['Internal server error']);
  });
});
