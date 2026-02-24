// UI components
import React from 'react';

export const Button = ({ children, ...props }: any) => {
  return <button {...props}>{children}</button>;
};

export const Card = ({ children, ...props }: any) => {
  return <div {...props}>{children}</div>;
};
