import React from 'react';

export interface DisputeTimelineEvent {
  type: 'dispute_opened' | 'arbitrator_assigned' | 'evidence_submitted' | 'dispute_resolved' | 'dispute_appealed';
  at: string;
  actor: string;
  notes?: string;
}

interface DisputeTimelineProps {
  events: DisputeTimelineEvent[];
}

export const DisputeTimeline: React.FC<DisputeTimelineProps> = ({ events }) => {
  const formatEventType = (type: string) => {
    switch (type) {
      case 'dispute_opened':
        return 'Dispute Opened';
      case 'arbitrator_assigned':
        return 'Arbitrator Assigned';
      case 'evidence_submitted':
        return 'Evidence Submitted';
      case 'dispute_resolved':
        return 'Dispute Resolved';
      case 'dispute_appealed':
        return 'Dispute Appealed';
      default:
        return type;
    }
  };

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {events.map((event, idx) => (
          <li key={idx}>
            <div className="relative pb-8">
              {idx !== events.length - 1 ? (
                <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
              ) : null}
              <div className="relative flex space-x-3">
                <div>
                  <span className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center ring-8 ring-white text-white text-xs font-bold">
                    {idx + 1}
                  </span>
                </div>
                <div className="min-w-0 flex-1 pt-1.5 flex justify-between space-x-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formatEventType(event.type)}</p>
                    {event.notes && <p className="text-sm text-gray-500 mt-0.5">{event.notes}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      Actor: <span className="font-mono">{event.actor}</span>
                    </p>
                  </div>
                  <div className="text-right text-xs whitespace-nowrap text-gray-500">
                    <time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time>
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
