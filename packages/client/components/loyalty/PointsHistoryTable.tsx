"use client";
import React from "react";

export type HistoryItem = {
  id: string;
  date: string; // ISO
  description: string;
  points: number; // positive or negative
};

export type HistoryHook = {
  items: HistoryItem[];
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  setPage: (p: number) => void;
  refetch: () => void;
};

export function PointsHistoryTable({ history }: { history: HistoryHook }) {
  const totalPages = Math.max(1, Math.ceil((history.total || 0) / (history.pageSize || 1)));

  return (
    <div className="rounded-lg border p-4 bg-background">
      <h2 className="text-lg font-medium mb-2">Points History</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-2">Date</th>
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Points</th>
            </tr>
          </thead>
          <tbody>
            {history.loading && history.items.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-4 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            ) : history.items.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-4 text-center text-muted-foreground">
                  No history yet
                </td>
              </tr>
            ) : (
              history.items.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="py-2">{new Date(it.date).toLocaleDateString()}</td>
                  <td className="py-2">{it.description}</td>
                  <td className="py-2 text-right font-medium {it.points>=0? 'text-green-600':'text-red-600'}">
                    {it.points > 0 ? '+' : ''}{it.points}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-3 text-sm">
        <div className="text-muted-foreground">Page {history.page} of {totalPages}</div>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 rounded border disabled:opacity-50"
            disabled={history.page <= 1}
            onClick={() => history.setPage(history.page - 1)}
          >
            Prev
          </button>
          <button
            className="px-3 py-1 rounded border disabled:opacity-50"
            disabled={history.page >= totalPages}
            onClick={() => history.setPage(history.page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
