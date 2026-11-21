import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StripePaymentGateway } from './stripe-payment-gateway';

// The REAL stripe library signs and checks here; nothing goes over the network.
const SECRET = 'whsec_unit_test_secret';
const gateway = (webhookSecret = SECRET) =>
  new StripePaymentGateway(new ConfigService({ stripe: { webhookSecret, secretKey: '' } }));

const event = (type: string, object: object) =>
  JSON.stringify({ id: 'evt_1', object: 'event', type, data: { object } });
const sign = (payload: string, timestamp?: number) =>
  Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET, timestamp });
const verify = (payload: string, header: string | undefined) =>
  gateway().verifyWebhook(Buffer.from(payload), header);

describe('StripePaymentGateway.verifyWebhook', () => {
  const body = event('payment_intent.succeeded', { id: 'pi_1', object: 'payment_intent' });

  it('accepts a correctly signed event and reduces it to id, type and payment intent', () => {
    expect(verify(body, sign(body))).toEqual({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      paymentIntentId: 'pi_1',
    });
  });

  it('finds the payment intent of a charge event (a refund points to it)', () => {
    const charge = event('charge.refunded', {
      id: 'ch_1',
      object: 'charge',
      payment_intent: 'pi_7',
    });

    expect(verify(charge, sign(charge)).paymentIntentId).toBe('pi_7');
  });

  it('an event about something else has no payment intent', () => {
    const other = event('customer.created', { id: 'cus_1', object: 'customer' });

    expect(verify(other, sign(other)).paymentIntentId).toBeNull();
  });

  it('refuses a body changed by one character', () => {
    expect(() => verify(body.replace('pi_1', 'pi_2'), sign(body))).toThrow(BadRequestException);
  });

  it('refuses the same JSON written differently: the signature covers the exact bytes', () => {
    const pretty = JSON.stringify(JSON.parse(body), null, 2);

    expect(() => verify(pretty, sign(body))).toThrow(BadRequestException);
  });

  it('refuses a signature made with another secret', () => {
    const forged = Stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: 'whsec_other',
    });

    expect(() => verify(body, forged)).toThrow(BadRequestException);
  });

  it('refuses a correct signature that is 10 minutes old (replay protection, 5 minutes allowed)', () => {
    const old = sign(body, Math.floor(Date.now() / 1000) - 600);

    expect(() => verify(body, old)).toThrow(BadRequestException);
  });

  it('refuses a request without the signature header', () => {
    expect(() => verify(body, undefined)).toThrow(BadRequestException);
  });

  it('answers 503 when the webhook secret is not configured (not a silent "accept everything")', () => {
    expect(() => gateway('').verifyWebhook(Buffer.from(body), sign(body))).toThrow(
      ServiceUnavailableException,
    );
  });
});
