import React, { useState, useRef, useEffect } from 'react';

export interface PassengerDetails {
  firstName: string;
  lastName: string;
  email: string;
  passportNumber: string;
}

interface PassengerFormProps {
  initialValues?: PassengerDetails;
  onSubmit: (values: PassengerDetails) => Promise<{ success: boolean; errors?: Record<string, string> }>;
}

export const PassengerForm: React.FC<PassengerFormProps> = ({ initialValues, onSubmit }) => {
  const [values, setValues] = useState<PassengerDetails>(initialValues || {
    firstName: '',
    lastName: '',
    email: '',
    passportNumber: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passportNumberRef = useRef<HTMLInputElement>(null);

  const fieldRefs: Record<string, React.RefObject<HTMLInputElement>> = {
    firstName: firstNameRef,
    lastName: lastNameRef,
    email: emailRef,
    passportNumber: passportNumberRef,
  };

  const handleChange = (field: keyof PassengerDetails, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const result = await onSubmit(values);
      if (!result.success && result.errors) {
        setErrors(result.errors);
        const firstErrorField = Object.keys(result.errors)[0];
        if (firstErrorField && fieldRefs[firstErrorField]?.current) {
          fieldRefs[firstErrorField].current?.focus();
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div>
        <label htmlFor="firstName">First Name</label>
        <input
          id="firstName"
          ref={firstNameRef}
          type="text"
          value={values.firstName}
          onChange={e => handleChange('firstName', e.target.value)}
          aria-invalid={Boolean(errors.firstName)}
          aria-describedby={errors.firstName ? 'firstName-error' : undefined}
        />
        {errors.firstName && <span id="firstName-error" role="alert">{errors.firstName}</span>}
      </div>

      <div>
        <label htmlFor="lastName">Last Name</label>
        <input
          id="lastName"
          ref={lastNameRef}
          type="text"
          value={values.lastName}
          onChange={e => handleChange('lastName', e.target.value)}
          aria-invalid={Boolean(errors.lastName)}
          aria-describedby={errors.lastName ? 'lastName-error' : undefined}
        />
        {errors.lastName && <span id="lastName-error" role="alert">{errors.lastName}</span>}
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          ref={emailRef}
          type="email"
          value={values.email}
          onChange={e => handleChange('email', e.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email && <span id="email-error" role="alert">{errors.email}</span>}
      </div>

      <div>
        <label htmlFor="passportNumber">Passport Number</label>
        <input
          id="passportNumber"
          ref={passportNumberRef}
          type="text"
          value={values.passportNumber}
          onChange={e => handleChange('passportNumber', e.target.value)}
          aria-invalid={Boolean(errors.passportNumber)}
          aria-describedby={errors.passportNumber ? 'passportNumber-error' : undefined}
        />
        {errors.passportNumber && <span id="passportNumber-error" role="alert">{errors.passportNumber}</span>}
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Submitting...' : 'Submit Booking'}
      </button>
    </form>
  );
};
