// UI hooks
import { useState } from 'react';

export const useToggle = (initialState = false) => {
  const [state, setState] = useState(initialState);
  const toggle = () => setState(!state);
  return [state, toggle] as const;
};
