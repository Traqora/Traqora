import React, { useEffect, useState } from 'react';
import { DisputeTimeline } from '../../components/governance/DisputeTimeline';

interface DisputeItem {
  id: string;
  refundId: string;
  bookingId: string;
  status: string;
  disputeType: string;
  description: string;
  evidence: Array<{
    id: string;
    submittedBy: string;
    description: string;
    fileUrl: string | null;
    submittedAt: string;
  }>;
  timeline: Array<{
    type: 'dispute_opened' | 'arbitrator_assigned' | 'evidence_submitted' | 'dispute_resolved' | 'dispute_appealed';
    at: string;
    actor: string;
    notes?: string;
  }>;
}

export default function DisputesPage() {
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDispute, setSelectedDispute] = useState<DisputeItem | null>(null);
  const [evidenceDesc, setEvidenceDesc] = useState<string>('');
  const [evidenceUrl, setEvidenceUrl] = useState<string>('');

  const fetchDisputes = async () => {
    try {
      const res = await fetch('/api/disputes', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setDisputes(data.items || []);
        if (data.items?.length && !selectedDispute) {
          setSelectedDispute(data.items[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load disputes', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDisputes();
  }, []);

  const handleUploadEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDispute) return;
    try {
      const res = await fetch(`/api/disputes/${selectedDispute.id}/evidence`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          description: evidenceDesc,
          fileUrl: evidenceUrl || undefined,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedDispute(updated);
        setEvidenceDesc('');
        setEvidenceUrl('');
        fetchDisputes();
      }
    } catch (err) {
      console.error('Failed to submit evidence', err);
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Loading disputes...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Dispute Resolution & Evidence Center</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white shadow rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-4">Your Disputes</h2>
          {disputes.length === 0 ? (
            <p className="text-gray-500">No disputes found.</p>
          ) : (
            <ul className="space-y-2">
              {disputes.map((d) => (
                <li
                  key={d.id}
                  onClick={() => setSelectedDispute(d)}
                  className={`p-3 rounded cursor-pointer border ${selectedDispute?.id === d.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                >
                  <div className="font-medium">Dispute #{d.id.slice(0, 8)}</div>
                  <div className="text-sm text-gray-500 capitalize">Type: {d.disputeType}</div>
                  <div className="text-xs text-gray-400 capitalize">Status: {d.status}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="md:col-span-2 bg-white shadow rounded-lg p-6">
          {selectedDispute ? (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Dispute Details</h2>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 uppercase">
                  {selectedDispute.status}
                </span>
              </div>
              <p className="text-gray-700 mb-4">{selectedDispute.description}</p>

              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-2">Timeline</h3>
                <DisputeTimeline events={selectedDispute.timeline} />
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-2">Submit Evidence (IPFS)</h3>
                <form onSubmit={handleUploadEvidence} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Description</label>
                    <textarea
                      value={evidenceDesc}
                      onChange={(e) => setEvidenceDesc(e.target.value)}
                      required
                      minLength={5}
                      className="mt-1 block w-full border border-gray-300 rounded-md p-2"
                      placeholder="Describe the evidence document or link..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">File / IPFS CID URL (optional)</label>
                    <input
                      type="text"
                      value={evidenceUrl}
                      onChange={(e) => setEvidenceUrl(e.target.value)}
                      className="mt-1 block w-full border border-gray-300 rounded-md p-2"
                      placeholder="ipfs://bafybeig... or https://gateway.pinata.cloud/ipfs/..."
                    />
                  </div>
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-medium"
                  >
                    Upload Evidence
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Select a dispute to view timeline and upload evidence.</p>
          )}
        </div>
      </div>
    </div>
  );
}
