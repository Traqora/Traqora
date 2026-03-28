export type StellarErrorMapping = {
  code: string;
  message: string;
  details?: unknown;
};

const RESULT_CODE_MAP: Record<string, { code: string; message: string }> = {
  tx_bad_auth: {
    code: 'STELLAR_BAD_AUTH',
    message: 'Transaction signature is invalid or missing.',
  },
  tx_insufficient_fee: {
    code: 'STELLAR_INSUFFICIENT_FEE',
    message: 'Transaction fee is too low.',
  },
  tx_bad_seq: {
    code: 'STELLAR_BAD_SEQUENCE',
    message: 'Transaction sequence number is invalid.',
  },
  tx_too_late: {
    code: 'STELLAR_TOO_LATE',
    message: 'Transaction is outside the allowed time bounds.',
  },
  op_no_source_account: {
    code: 'STELLAR_ACCOUNT_NOT_FOUND',
    message: 'Source account does not exist on the network.',
  },
};

export const mapStellarError = (error: any): StellarErrorMapping | null => {
  if (!error) return null;

  const message = typeof error.message === 'string' ? error.message : '';
  const responseData = error.response?.data;
  const resultCodes = responseData?.extras?.result_codes;

  if (resultCodes?.transaction) {
    const mapped = RESULT_CODE_MAP[resultCodes.transaction];
    if (mapped) {
      return {
        ...mapped,
        details: { resultCodes },
      };
    }
  }

  if (message.toLowerCase().includes('simulation failed')) {
    return {
      code: 'SOROBAN_SIMULATION_FAILED',
      message: 'Soroban simulation failed. Please retry or verify parameters.',
      details: responseData?.extras || responseData || message,
    };
  }

  if (message.toLowerCase().includes('horizon')) {
    return {
      code: 'STELLAR_HORIZON_ERROR',
      message: 'Unable to reach Horizon. Please try again later.',
      details: responseData || message,
    };
  }

  if (message.toLowerCase().includes('soroban rpc')) {
    return {
      code: 'SOROBAN_RPC_ERROR',
      message: 'Soroban RPC error. Please try again later.',
      details: responseData || message,
    };
  }

  return null;
};
