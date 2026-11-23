import { processSupplierCancellation } from './supplierCancellationService';
import { SupplierService } from './supplierService';

jest.mock('./supplierService');

describe('processSupplierCancellation', () => {
  it('should return cancelled when supplier cancellation succeeds', async () => {
    jest.spyOn(SupplierService, 'cancelSupplier').mockResolvedValueOnce({ success: true });
    const res = await processSupplierCancellation('sup-1');
    expect(res).toEqual({ success: true, status: 'cancelled' });
  });

  it('should return pending when cancellation is ambiguous', async () => {
    jest.spyOn(SupplierService, 'cancelSupplier').mockResolvedValueOnce({ success: false, ambiguous: true });
    const res = await processSupplierCancellation('sup-1');
    expect(res).toEqual({ success: false, status: 'pending', ambiguous: true });
  });

  it('should return failed when cancellation fails explicitly', async () => {
    jest.spyOn(SupplierService, 'cancelSupplier').mockResolvedValueOnce({ success: false, ambiguous: false });
    const res = await processSupplierCancellation('sup-1');
    expect(res).toEqual({ success: false, status: 'failed' });
  });

  it('should return pending when an error is thrown', async () => {
    jest.spyOn(SupplierService, 'cancelSupplier').mockRejectedValueOnce(new Error('Network error'));
    const res = await processSupplierCancellation('sup-1');
    expect(res).toEqual({ success: false, status: 'pending', ambiguous: true });
  });
});
