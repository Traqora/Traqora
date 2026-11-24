class Booking {
  constructor(data) {
    this.id = data.id;
    this.status = (data.status || 'PENDING').toUpperCase();
  }

  transitionTo(newStatus) {
    const upperNewStatus = newStatus.toUpperCase();
    const validTransitions = {
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['COMPLETED', 'CANCELLED'],
      COMPLETED: [],
      CANCELLED: []
    };

    if (!validTransitions[this.status] || !validTransitions[this.status].includes(upperNewStatus)) {
      throw new Error(`Invalid state transition from ${this.status} to ${upperNewStatus}`);
    }

    this.status = upperNewStatus;
  }

  async updateStatus(newStatus) {
    this.transitionTo(newStatus);
    this.status = this.status.toLowerCase();
  }
}

module.exports = Booking;
