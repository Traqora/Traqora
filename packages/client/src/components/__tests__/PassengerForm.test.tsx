import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PassengerForm } from '../PassengerForm';

describe('PassengerForm Error Recovery', () => {
  it('preserves valid entered values and focuses the first actionable error when server validation fails', async () => {
    const mockSubmit = jest.fn().mockResolvedValue({
      success: false,
      errors: {
        lastName: 'Last name is required',
        email: 'Invalid email format',
      },
    });

    render(<PassengerForm onSubmit={mockSubmit} />);

    const firstNameInput = screen.getByLabelText(/First Name/i);
    const emailInput = screen.getByLabelText(/Email/i);

    fireEvent.change(firstNameInput, { target: { value: 'Jane' } });
    fireEvent.change(emailInput, { target: { value: 'jane.doe@example.com' } });

    const submitButton = screen.getByRole('button', { name: /Submit Booking/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledTimes(1);
    });

    expect(firstNameInput).toHaveValue('Jane');
    expect(emailInput).toHaveValue('jane.doe@example.com');

    const lastNameInput = screen.getByLabelText(/Last Name/i);
    await waitFor(() => {
      expect(document.activeElement).toBe(lastNameInput);
    });

    expect(lastNameInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Last name is required')).toBeInTheDocument();
  });

  it('submits successfully when all values are valid', async () => {
    const mockSubmit = jest.fn().mockResolvedValue({ success: true });

    render(<PassengerForm onSubmit={mockSubmit} />);

    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText(/Passport Number/i), { target: { value: 'AB12345' } });

    fireEvent.click(screen.getByRole('button', { name: /Submit Booking/i }));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith({
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        passportNumber: 'AB12345',
      });
    });
  });
});
