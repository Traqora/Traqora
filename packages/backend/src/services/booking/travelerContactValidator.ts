export interface TravelerContactDetails {
  email?: string;
  phone?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  normalizedEmail?: string;
  normalizedPhone?: string;
}

export function validateTravelerContact(contact: TravelerContactDetails): ValidationResult {
  const email = contact.email?.trim();
  const phone = contact.phone?.trim();

  if (!email && !phone) {
    return {
      valid: false,
      error: 'At least one contact channel (email or phone) is required for booking updates.',
    };
  }

  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        valid: false,
        error: 'Invalid email address format.',
      };
    }
  }

  if (phone) {
    const phoneRegex = /^[+]?[0-9().\-\s]{7,15}$/;
    if (!phoneRegex.test(phone)) {
      return {
        valid: false,
        error: 'Invalid phone number format.',
      };
    }
  }

  return {
    valid: true,
    normalizedEmail: email ? email.toLowerCase() : undefined,
    normalizedPhone: phone ? phone.replace(/[^0-9+]/g, '') : undefined,
  };
}
