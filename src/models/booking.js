const VALID_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: []
};

function isValidBookingTransition(currentState, nextState) {
  if (!VALID_TRANSITIONS[currentState]) {
    return false;
  }
  return VALID_TRANSITIONS[currentState].includes(nextState);
}

module.exports = {
  VALID_TRANSITIONS,
  isValidBookingTransition
};
