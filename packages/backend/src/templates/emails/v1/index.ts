export const bookingTemplate = (data: any) => ({
  subject: `Booking Confirmation: ${data.bookingReference}`,
  text: `Your booking is confirmed! Reference: ${data.bookingReference}. Flight: ${data.flightNumber}`,
  html: `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Booking Confirmation</h2>
      <p>Your booking is confirmed!</p>
      <ul>
        <li><strong>Reference:</strong> ${data.bookingReference}</li>
        <li><strong>Flight:</strong> ${data.flightNumber}</li>
        <li><strong>Date:</strong> ${data.departureDate}</li>
      </ul>
      <p>Thank you for choosing Traqora!</p>
    </div>
  `,
});

export const reminderTemplate = (data: any) => ({
  subject: `Flight Reminder: ${data.flightNumber} departs in 24 hours`,
  text: `Reminder: Your flight ${data.flightNumber} departs on ${data.departureDate}. Please check in.`,
  html: `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Flight Reminder</h2>
      <p>This is a reminder that your flight <strong>${data.flightNumber}</strong> departs on <strong>${data.departureDate}</strong>.</p>
      <p>Please remember to check in 24 hours before departure.</p>
    </div>
  `,
});

export const refundTemplate = (data: any) => ({
  subject: `Refund Processed for Booking ${data.bookingReference}`,
  text: `Your refund of ${data.refundAmount} has been processed for booking ${data.bookingReference}.`,
  html: `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Refund Processed</h2>
      <p>Your refund request has been processed.</p>
      <ul>
        <li><strong>Booking Reference:</strong> ${data.bookingReference}</li>
        <li><strong>Amount Refunded:</strong> ${data.refundAmount}</li>
      </ul>
      <p>Please allow 3-5 business days for the funds to reflect in your account.</p>
    </div>
  `,
});

export const analyticsExportTemplate = (data: any) => ({
  subject: `Analytics export ready: ${data.dataset}`,
  text: `Your ${data.dataset} analytics export is ready. Download it here: ${data.downloadUrl}. This link expires at ${data.expiresAt}.`,
  html: `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Analytics Export Ready</h2>
      <p>Your requested analytics export is ready for download.</p>
      <ul>
        <li><strong>Dataset:</strong> ${data.dataset}</li>
        <li><strong>Format:</strong> ${data.format}</li>
        <li><strong>Rows:</strong> ${data.rowCount}</li>
        <li><strong>Expires:</strong> ${data.expiresAt}</li>
      </ul>
      <p><a href="${data.downloadUrl}">Download export</a></p>
    </div>
  `,
});
