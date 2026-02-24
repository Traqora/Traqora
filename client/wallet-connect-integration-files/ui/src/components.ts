// UI components
import React from 'react';

export const Button = ({ children, ...props }: any) => {
  return React.createElement('button', props, children);
};

export const Card = ({ children, ...props }: any) => {
  return React.createElement('div', props, children);
};
