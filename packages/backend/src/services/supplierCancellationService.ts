import { SupplierService } from './supplierService';

export interface CancellationResult {
  success: boolean;
  status: 'cancelled' | 'pending' | 'failed';
  ambiguous?: boolean;
}

export async function processSupplierCancellation(supplierId: string): Promise<CancellationResult> {
  try {
    const result = await SupplierService.cancelSupplier(supplierId);
    if (result && result.success) {
      return { success: true, status: 'cancelled' };
    }
    if (result && result.ambiguous) {
      return { success: false, status: 'pending', ambiguous: true };
    }
    return { success: false, status: 'failed' };
  } catch (error) {
    return { success: false, status: 'pending', ambiguous: true };
  }
}
