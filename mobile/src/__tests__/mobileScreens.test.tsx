import React from 'react';
import { render } from '@testing-library/react-native';
import HomeScreen from '../screens/HomeScreen';

describe('Mobile Home Screen', () => {
  it('renders correctly', () => {
    const { getByText } = render(<HomeScreen onNavigateSearch={() => {}} />);
    expect(getByText('Traqora Mobile')).toBeTruthy();
    expect(getByText('Search Flights')).toBeTruthy();
  });
});
