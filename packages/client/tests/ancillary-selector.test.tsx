import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AncillarySelector } from '@/components/booking/ancillary-selector';
import { fetchAncillaryCatalog } from '@/lib/ancillary-api';

jest.mock('@/lib/ancillary-api', () => ({
  fetchAncillaryCatalog: jest.fn(),
}));

const mockedFetchCatalog = fetchAncillaryCatalog as jest.MockedFunction<
  typeof fetchAncillaryCatalog
>;

const catalog = [
  {
    code: 'PRIORITY_BOARDING',
    name: 'Priority boarding',
    description: 'Board before general boarding.',
    type: 'priority_boarding' as const,
    priceCents: 2500,
    availableCabins: ['economy' as const],
  },
  {
    code: 'LOUNGE_STANDARD',
    name: 'Airport lounge access',
    description: 'Relax before departure.',
    type: 'lounge_access' as const,
    priceCents: 4500,
    availableCabins: ['economy' as const],
  },
];

describe('AncillarySelector', () => {
  beforeEach(() => {
    mockedFetchCatalog.mockResolvedValue(catalog);
  });

  it('loads cabin-aware services and reports selected items', async () => {
    const onSelectionChange = jest.fn();
    render(
      <AncillarySelector
        cabinClass="economy"
        airport="JFK"
        selectedCodes={[]}
        onSelectionChange={onSelectionChange}
      />,
    );

    expect(screen.getByText('Loading available extras…')).toBeInTheDocument();
    expect(await screen.findByText('Priority boarding')).toBeInTheDocument();
    expect(mockedFetchCatalog).toHaveBeenCalledWith('economy', 'JFK');

    fireEvent.click(screen.getByLabelText('Select Priority boarding'));
    expect(onSelectionChange).toHaveBeenCalledWith([catalog[0]]);
  });

  it('shows the selected count and total', async () => {
    render(
      <AncillarySelector
        cabinClass="economy"
        selectedCodes={['PRIORITY_BOARDING']}
        onSelectionChange={jest.fn()}
      />,
    );

    await screen.findByText('Priority boarding');
    expect(screen.getByText('1 extra selected')).toBeInTheDocument();
    expect(screen.getByText('+$25.00')).toBeInTheDocument();
  });

  it('fails open so checkout can continue when the catalog is unavailable', async () => {
    mockedFetchCatalog.mockRejectedValueOnce(new Error('offline'));
    render(
      <AncillarySelector
        cabinClass="economy"
        selectedCodes={[]}
        onSelectionChange={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Extras are temporarily unavailable. You can continue without them.'),
      ).toBeInTheDocument();
    });
  });
});
