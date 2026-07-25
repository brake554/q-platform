import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Payouts({ businessId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/payments/business/${businessId}/payouts`)
      .then(setData)
      .catch(console.error);
  }, [businessId]);

  async function handleOnboard() {
    try {
      const { onboardingUrl } = await api.post('/payments/business/onboard', { businessId });
      window.location.href = onboardingUrl;
    } catch (err) { alert(err.message); }
  }

  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#f4f4f8', marginBottom: 24 }}>Payouts</h2>

      {data && (
        <>
          {/* Pending balance */}
          <div style={{ background: 'linear-gradient(135deg, rgba(45,212,143,0.12), #0f2a1f)', border: '1px solid #1a3a2a', borderRadius: 16, padding: 24, marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: '#2dd48f', letterSpacing: 1, marginBottom: 6 }}>PENDING PAYOUT</div>
            <div style={{ fontSize: 40, fontWeight: 900, color: '#f4f4f8' }}>
              ${((data.pending_cents || 0) / 100).toFixed(2)}
            </div>
            <div style={{ fontSize: 13, color: '#50505f', marginTop: 6 }}>
              Paid out bi-weekly every other Monday at 3:00 AM UTC
            </div>
          </div>

          {/* Stripe Connect status */}
          <div style={{ background: '#101016', border: '1px solid #1a1a26', borderRadius: 14, padding: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 14, color: '#9a9aad', marginBottom: 8 }}>Stripe Connect Status</div>
            <button onClick={handleOnboard}
              style={{ padding: '12px 20px', fontSize: 14, fontWeight: 700, background: '#8b5cf6', border: 'none', borderRadius: 10, color: '#fff', cursor: 'pointer' }}>
              Set Up / Manage Stripe Payouts
            </button>
          </div>

          {/* Payout history */}
          {data.payouts?.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: '#50505f', letterSpacing: 1, marginBottom: 12 }}>PAYOUT HISTORY</div>
              {data.payouts.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#101016', border: '1px solid #1a1a26', borderRadius: 12, padding: '14px 16px', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#f4f4f8' }}>
                      ${(parseInt(p.net_total_cents) / 100).toFixed(2)}
                    </div>
                    <div style={{ fontSize: 12, color: '#50505f' }}>
                      {new Date(p.paid_out_at).toLocaleDateString()} · {p.transaction_count} transactions
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: '#2dd48f', background: 'rgba(45,212,143,0.12)', borderRadius: 6, padding: '3px 8px' }}>
                    PAID
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
