/**
 * Example: Complete Refund Flow
 * 
 * This example demonstrates the full refund processing flow:
 * 1. Create a refund request
 * 2. Check eligibility
 * 3. Process Stripe refund
 * 4. Submit on-chain refund
 * 5. Monitor status
 */

import { RefundService } from '../src/services/refundService';
import { initDataSource, AppDataSource } from '../src/db/dataSource';
import { Booking } from '../src/db/entities/Booking';

async function exampleRefundFlow() {
  // Initialize database
  await initDataSource();

  const refundService = RefundService.getInstance();

  try {
    // Step 1: Get a booking (in real scenario, this would be from user input)
    const bookingRepo = AppDataSource.getRepository(Booking);
    const booking = await bookingRepo.findOne({
      where: { status: 'confirmed' },
      relations: ['flight', 'passenger'],
    });

    if (!booking) {
      console.log('No confirmed bookings found for testing');
      return;
    }

    console.log('📋 Booking Details:');
    console.log(`  ID: ${booking.id}`);
    console.log(`  Flight: ${booking.flight.flightNumber}`);
    console.log(`  Amount: $${(booking.amountCents / 100).toFixed(2)}`);
    console.log(`  Departure: ${booking.flight.departureTime}`);
    console.log('');

    // Step 2: Check eligibility
    console.log('🔍 Checking refund eligibility...');
    const eligibility = await refundService.checkEligibility(booking);
    console.log(`  Eligible: ${eligibility.isEligible}`);
    console.log(`  Refund Percentage: ${eligibility.refundPercentage}%`);
    console.log(`  Processing Fee: $${(eligibility.processingFeeCents / 100).toFixed(2)}`);
    console.log(`  Manual Review Required: ${eligibility.requiresManualReview}`);
    console.log(`  Reason: ${eligibility.reason}`);
    console.log('');

    // Step 3: Create refund request
    console.log('📝 Creating refund request...');
    const refund = await refundService.createRefundRequest({
      bookingId: booking.id,
      reason: 'customer_request',
      reasonDetails: 'Example refund flow demonstration',
      requestedBy: booking.passenger.email,
    });

    console.log(`  Refund ID: ${refund.id}`);
    console.log(`  Status: ${refund.status}`);
    console.log(`  Requested Amount: $${(refund.requestedAmountCents / 100).toFixed(2)}`);
    console.log(`  Approved Amount: $${((refund.approvedAmountCents || 0) / 100).toFixed(2)}`);
    console.log('');

    // Step 4: If requires manual review, demonstrate admin review
    if (refund.requiresManualReview) {
      console.log('👤 Refund requires manual review');
      console.log('   Admin would review and approve/reject via:');
      console.log('   POST /api/v1/refunds/:id/review');
      console.log('');

      // Example manual review (in real scenario, this would be done by admin)
      console.log('🔐 Simulating admin review...');
      const reviewed = await refundService.manualReview(
        refund.id,
        true, // approved
        'admin@example.com',
        'Approved for demonstration purposes',
        75 // 75% refund
      );
      console.log(`  Review Status: ${reviewed.status}`);
      console.log(`  Reviewed By: ${reviewed.reviewedBy}`);
      console.log('');
    }

    // Step 5: Check if on-chain refund is needed
    const updatedRefund = await refundService.getRefund(refund.id);
    if (updatedRefund?.sorobanUnsignedXdr) {
      console.log('⛓️  On-chain refund required');
      console.log('   Customer would sign transaction:');
      console.log(`   XDR: ${updatedRefund.sorobanUnsignedXdr.substring(0, 50)}...`);
      console.log('');
      console.log('   Then submit via:');
      console.log('   POST /api/v1/refunds/:id/submit-onchain');
      console.log('');

      // In real scenario, customer would sign and submit
      // For demo, we'll simulate submission
      console.log('📤 Simulating on-chain submission...');
      const submitted = await refundService.submitOnchainRefund(
        refund.id,
        'mock_signed_xdr_for_demo'
      );
      console.log(`  Transaction Hash: ${submitted.sorobanTxHash}`);
      console.log(`  Status: ${submitted.status}`);
      console.log('');
    }

    // Step 6: Check final status
    console.log('✅ Checking final refund status...');
    const finalRefund = await refundService.getRefund(refund.id);
    if (finalRefund) {
      console.log(`  Final Status: ${finalRefund.status}`);
      console.log(`  Stripe Refund ID: ${finalRefund.stripeRefundId || 'N/A'}`);
      console.log(`  Soroban TX Hash: ${finalRefund.sorobanTxHash || 'N/A'}`);
      console.log(`  Approved Amount: $${((finalRefund.approvedAmountCents || 0) / 100).toFixed(2)}`);
      console.log('');
    }

    // Step 7: Show audit trail
    console.log('📊 Audit Trail:');
    const auditService = (await import('../src/services/refundAuditService')).RefundAuditService.getInstance();
    const auditTrail = await auditService.getAuditTrail(refund.id);
    auditTrail.forEach((entry, index) => {
      console.log(`  ${index + 1}. ${entry.action}`);
      console.log(`     Status: ${entry.previous_status} → ${entry.new_status}`);
      console.log(`     Actor: ${entry.actor || 'System'}`);
      console.log(`     Time: ${entry.created_at}`);
    });

    console.log('');
    console.log('✨ Refund flow demonstration complete!');

  } catch (error) {
    console.error('❌ Error during refund flow:', error);
    throw error;
  } finally {
    // Cleanup
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

// Run the example
// To run this example: ts-node backend/examples/refund-flow-example.ts
exampleRefundFlow()
  .then(() => {
    console.log('Example completed successfully');
  })
  .catch((error) => {
    console.error('Example failed:', error);
  });

export { exampleRefundFlow };
