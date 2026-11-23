const fs = require('fs');
const path = require('path');

describe('V1 Payment Method Documentation', () => {
  it('exists and contains required sections', () => {
    const filePath = path.join(__dirname, '../V1_PAYMENT_METHOD.md');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).toContain('Supported Payment Method');
    expect(content).toContain('Supported Asset');
    expect(content).toContain('Supported Network');
    expect(content).toContain('Unsupported Payment Cases');
  });
});
