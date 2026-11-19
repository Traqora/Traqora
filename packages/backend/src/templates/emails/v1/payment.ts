export const paymentTemplate = (data: any) => ({
  subject: `Payment Confirmed: ${data.bookingReference ?? "Booking"}`,
  text: `Payment confirmed for booking ${data.bookingReference ?? ""}. Amount: ${data.amount ?? "N/A"}.`,
  html: `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Payment Confirmed</h2>
      <p>Your payment has been confirmed.</p>
      <ul>
        <li><strong>Booking Reference:</strong> ${data.bookingReference ?? "N/A"}</li>
        <li><strong>Amount:</strong> ${data.amount ?? "N/A"}</li>
      </ul>
      <p>Thank you for choosing Traqora.</p>
    </div>
  `,
});
