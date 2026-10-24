import {
  SigningRequestBusyError,
  SigningRequestGate,
  SigningRequestTimeoutError,
  isWalletSignatureRejection,
} from '@/lib/signing-request-gate';

describe('SigningRequestGate (#938)', () => {
  it('coalesces duplicate requests for the same pending action', async () => {
    const gate = new SigningRequestGate();
    let calls = 0;
    let resolveOperation: (value: string) => void = () => {};
    const operation = () => {
      calls += 1;
      return new Promise<string>((resolve) => {
        resolveOperation = resolve;
      });
    };

    const first = gate.run('booking-1:tx-1', operation);
    const second = gate.run('booking-1:tx-1', operation);

    expect(second).toBe(first);
    expect(calls).toBe(1);
    expect(gate.isPending('booking-1:tx-1')).toBe(true);

    resolveOperation('signed');
    await expect(first).resolves.toBe('signed');
    await expect(second).resolves.toBe('signed');
    expect(gate.isPending()).toBe(false);
  });

  it('rejects a different action while a signature is pending, then allows it after cleanup', async () => {
    const gate = new SigningRequestGate();
    let resolveFirst: (value: string) => void = () => {};
    const first = gate.run('booking-1:tx-1', () => new Promise<string>((resolve) => {
      resolveFirst = resolve;
    }));

    await expect(gate.run('booking-2:tx-2', async () => 'second')).rejects.toBeInstanceOf(
      SigningRequestBusyError,
    );

    resolveFirst('first');
    await first;

    await expect(gate.run('booking-2:tx-2', async () => 'second')).resolves.toBe('second');
  });

  it('times out, aborts the operation signal, and restores the gate for a retry', async () => {
    const gate = new SigningRequestGate();
    let aborted = false;

    const timedOut = gate.run(
      'booking-1:tx-1',
      (signal) =>
        new Promise<string>((_resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
          });
        }),
      { timeoutMs: 10 },
    );

    await expect(timedOut).rejects.toBeInstanceOf(SigningRequestTimeoutError);
    expect(aborted).toBe(true);
    expect(gate.isPending()).toBe(false);

    await expect(
      gate.run('booking-1:tx-1', async () => 'retried', { timeoutMs: 50 }),
    ).resolves.toBe('retried');
  });

  it('clears pending state after an operation rejection so retry is possible', async () => {
    const gate = new SigningRequestGate();

    await expect(
      gate.run('booking-1:tx-1', async () => {
        throw new Error('User declined the transaction');
      }),
    ).rejects.toThrow(/User declined/);

    expect(gate.isPending()).toBe(false);
    await expect(gate.run('booking-1:tx-1', async () => 'ok')).resolves.toBe('ok');
  });
});

describe('isWalletSignatureRejection', () => {
  it.each([
    'User declined the transaction',
    'Transaction rejected by user',
    'Request cancelled in wallet',
    'User denied signing',
  ])('recognizes %s', (message) => {
    expect(isWalletSignatureRejection(new Error(message))).toBe(true);
  });

  it('does not treat a timeout or unrelated failure as a rejection', () => {
    expect(isWalletSignatureRejection(new SigningRequestTimeoutError(10))).toBe(false);
    expect(isWalletSignatureRejection(new Error('Network unavailable'))).toBe(false);
  });
});
