class CohortAnalysisService {
  getReport(options = {}) {
    const period = options.period === 'quarter' ? 'quarter' : 'month';
    const collaborators = this._collaborators();
    const events = this._events();
    const cohorts = this._cohorts(collaborators, events, period);

    return {
      period,
      generatedAt: new Date().toISOString(),
      summary: this._summary(cohorts),
      cohorts,
      retentionMatrix: cohorts.map((cohort) => ({ cohort: cohort.cohort, size: cohort.size, periods: cohort.periods })),
      comparison: [...cohorts].sort((a, b) => b.ltv - a.ltv).map((cohort, index) => ({ rank: index + 1, cohort: cohort.cohort, ltv: cohort.ltv, churnRate: cohort.churnRate, totalRevenue: cohort.totalRevenue })),
      exportRows: cohorts.flatMap((cohort) => cohort.periods.map((periodEntry) => ({ cohort: cohort.cohort, cohortSize: cohort.size, periodOffset: periodEntry.offset, revenue: periodEntry.revenue, revenueRetention: periodEntry.revenueRetention, retentionRate: periodEntry.retentionRate, ltv: cohort.ltv, churnRate: cohort.churnRate }))),
    };
  }

  _cohorts(collaborators, events, period) {
    const groups = collaborators.reduce((acc, collaborator) => {
      const key = this._key(collaborator.joinedAt, period);
      acc[key] = acc[key] || [];
      acc[key].push(collaborator);
      return acc;
    }, {});
    return Object.entries(groups).map(([cohort, members]) => {
      const ids = new Set(members.map((member) => member.id));
      const cohortEvents = events.filter((event) => ids.has(event.collaboratorId));
      const baseRevenue = this._revenueAt(cohortEvents, cohort, period, 0) || 1;
      const periods = Array.from({ length: 6 }, (_, offset) => {
        const periodEvents = cohortEvents.filter((event) => this._offset(cohort, event.date, period) === offset);
        const activeCollaborators = new Set(periodEvents.map((event) => event.collaboratorId)).size;
        const revenue = periodEvents.reduce((sum, event) => sum + event.amount, 0);
        return { offset, revenue, revenueRetention: Number(((revenue / baseRevenue) * 100).toFixed(1)), activeCollaborators, retentionRate: Number(((activeCollaborators / members.length) * 100).toFixed(1)) };
      });
      const totalRevenue = cohortEvents.reduce((sum, event) => sum + event.amount, 0);
      const finalRetention = periods.at(-1)?.retentionRate ?? 0;
      return { cohort, size: members.length, joinPeriod: period, totalRevenue, ltv: Number((totalRevenue / members.length).toFixed(2)), churnRate: Number(Math.max(0, 100 - finalRetention).toFixed(1)), periods };
    });
  }

  _summary(cohorts) {
    const totalCollaborators = cohorts.reduce((sum, cohort) => sum + cohort.size, 0);
    const totalRevenue = cohorts.reduce((sum, cohort) => sum + cohort.totalRevenue, 0);
    return { totalCohorts: cohorts.length, totalCollaborators, totalRevenue, averageLtv: Number((totalRevenue / totalCollaborators).toFixed(2)), averageChurnRate: Number((cohorts.reduce((sum, cohort) => sum + cohort.churnRate, 0) / cohorts.length).toFixed(1)) };
  }

  _revenueAt(events, cohort, period, offset) { return events.filter((event) => this._offset(cohort, event.date, period) === offset).reduce((sum, event) => sum + event.amount, 0); }
  _offset(cohort, date, period) {
    const value = new Date(date);
    if (period === 'quarter') { const [year, quarter] = cohort.split('-Q').map(Number); return (value.getUTCFullYear() - year) * 4 + (Math.floor(value.getUTCMonth() / 3) + 1 - quarter); }
    const [year, month] = cohort.split('-').map(Number);
    return (value.getUTCFullYear() - year) * 12 + (value.getUTCMonth() + 1 - month);
  }
  _key(date, period) { const value = new Date(date); return period === 'quarter' ? `${value.getUTCFullYear()}-Q${Math.floor(value.getUTCMonth() / 3) + 1}` : `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`; }
  _collaborators() { return [{ id: 'col_001', joinedAt: '2024-01-12' }, { id: 'col_002', joinedAt: '2024-01-22' }, { id: 'col_003', joinedAt: '2024-02-08' }, { id: 'col_004', joinedAt: '2024-02-18' }, { id: 'col_005', joinedAt: '2024-03-04' }, { id: 'col_006', joinedAt: '2024-03-25' }, { id: 'col_007', joinedAt: '2024-04-11' }]; }
  _events() { return [{ collaboratorId: 'col_001', date: '2024-01-20', amount: 8200 }, { collaboratorId: 'col_001', date: '2024-02-20', amount: 7600 }, { collaboratorId: 'col_001', date: '2024-03-20', amount: 7100 }, { collaboratorId: 'col_002', date: '2024-01-25', amount: 6400 }, { collaboratorId: 'col_002', date: '2024-02-25', amount: 6100 }, { collaboratorId: 'col_003', date: '2024-02-14', amount: 9300 }, { collaboratorId: 'col_003', date: '2024-03-14', amount: 8900 }, { collaboratorId: 'col_003', date: '2024-04-14', amount: 9400 }, { collaboratorId: 'col_004', date: '2024-02-26', amount: 5400 }, { collaboratorId: 'col_005', date: '2024-03-10', amount: 11200 }, { collaboratorId: 'col_005', date: '2024-04-10', amount: 10600 }, { collaboratorId: 'col_006', date: '2024-03-29', amount: 7800 }, { collaboratorId: 'col_007', date: '2024-04-18', amount: 6800 }]; }
}
module.exports = { CohortAnalysisService };