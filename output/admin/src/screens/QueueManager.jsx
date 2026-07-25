/**
 * QueueManager — Live queue list with admit/remove controls
 */

import React, { useEffect, useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { api } from '../api/client.js';
import QueueRow from '../components/QueueRow.jsx';

export default function QueueManager({ businessId, queueUpdated }) {
  const [entries, setEntries] = useState([]);
  const [admitting, setAdmitting] = useState(null); // entryId being admitted
  const [loading, setLoading] = useState(true);

  const fetchQueue = useCallback(async () => {
    try {
      const { entries: e } = await api.get(`/queues/${businessId}/active`);
      setEntries(e || []);
    } catch (err) {
      console.error('Queue fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => { fetchQueue(); }, [fetchQueue, queueUpdated]);

  async function handleAdmit(entryId) {
    setAdmitting(entryId);
    try {
      await api.post(`/queues/${businessId}/admit/${entryId}`);
      // Queue will update via socket
    } catch (err) {
      alert(`Admit failed: ${err.message}`);
    } finally {
      setAdmitting(null);
    }
  }

  async function handleRemove(entryId) {
    if (!confirm('Remove this person from the queue?')) return;
    try {
      await api.post(`/queues/${businessId}/remove/${entryId}`);
    } catch (err) {
      alert(`Remove failed: ${err.message}`);
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f4f4f8' }}>Queue</h2>
        <div style={{ fontSize: 14, color: '#50505f' }}>{entries.length} waiting</div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: '#50505f', padding: 40 }}>Loading queue…</div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#50505f', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <div>Queue is empty</div>
        </div>
      ) : (
        <AnimatePresence>
          {entries.map((entry) => (
            <QueueRow
              key={entry.id}
              entry={entry}
              onAdmit={handleAdmit}
              onRemove={handleRemove}
              isAdmitting={admitting === entry.id}
            />
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}
