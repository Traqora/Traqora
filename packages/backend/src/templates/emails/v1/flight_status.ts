export const flightStatusTemplate = (data: any) => ({
  subject: `Flight Update: ${data.flightNumber ?? "Your flight"}`,
  text: `Flight update for ${data.flightNumber ?? "your flight"}. Status/change: ${data.status ?? data.changeType ?? "updated"}.`,
  html: `
    <div style="font-family: Arial, sans-serif; padding: 20px;">
      <h2>Flight Update</h2>
      <p>There is an update for your flight.</p>
      <ul>
        <li><strong>Flight:</strong> ${data.flightNumber ?? "N/A"}</li>
        <li><strong>Status/Change:</strong> ${data.status ?? data.changeType ?? "updated"}</li>
        ${data.reason ? `<li><strong>Reason:</strong> ${data.reason}</li>` : ""}
      </ul>
    </div>
  `,
});
