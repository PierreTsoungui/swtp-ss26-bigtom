import { useState, useEffect, useCallback } from 'react';
// BatchSettings aus dem Import entfernt
import type { BatchHistoryResponse, BatchErrorDetail, JobStatus } from '../utils/types';

export const useBatchCorrection = (jobId: string | undefined, onSkipSuccess: () => void) => {
  void onSkipSuccess;

  const [history, setHistory] = useState<BatchHistoryResponse | null>(null);
  const [globalStatus, setGlobalStatus] = useState<string>('idle'); 
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<BatchErrorDetail | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);

  const API_BASE = 'http://localhost:8000/api/v1';

  const fetchHistory = useCallback(async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`${API_BASE}/batch/${jobId}/history`);
      if (!res.ok) {
        const errData: BatchErrorDetail = await res.json();
        throw errData;
      }
      const data: BatchHistoryResponse = await res.json();
      setHistory(data);
      setError(null);
    } catch (err: any) {
      setError(err || { error: 'UNKNOWN', message: 'Failed to load batch history' });
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId || globalStatus !== 'running') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/status/${jobId}`);
        if (res.ok) {
          const data = await res.json();
          setJobStatus(data);

          if (data.status === 'batch_done' || data.status === 'filtering_done') {
            setGlobalStatus('batch_done');
            clearInterval(interval);
            fetchHistory();
          } else if (data.status === 'failed') {
            setGlobalStatus('failed');
            clearInterval(interval);
            setError({ error: 'BATCH_FAILED', message: 'The backend batch pipeline failed.' });
          }
        }
      } catch (e) {
        console.error('Error polling status:', e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, globalStatus, fetchHistory]);

  useEffect(() => {
    if (jobId) {
      fetchHistory();
    }
  }, [jobId, fetchHistory]);

  const runBatch = async (settings: any) => {
    if (!jobId) return;
    setGlobalStatus('running');
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/batch/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        const errData: BatchErrorDetail = await res.json();
        setGlobalStatus('idle');
        setError(errData);
        return;
      }
    } catch (err) {
      setGlobalStatus('idle');
      setError({ error: 'NETWORK_ERROR', message: 'Connection to server failed.' });
    }
  };

  const skipBatch = async () => {
    if (!jobId) return;
    setGlobalStatus('running'); 
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/batch/${jobId}/skip`, { method: 'POST' });
      if (!res.ok) {
        const errData: BatchErrorDetail = await res.json();
        setGlobalStatus('idle');
        throw errData;
      }
    } catch (err: any) {
      setGlobalStatus('idle');
      setError(err || { error: 'SKIP_FAILED', message: 'Skipping batch correction failed.' });
    }
  };

  return { history, globalStatus, jobStatus, loading, error, runBatch, skipBatch, setError };
};