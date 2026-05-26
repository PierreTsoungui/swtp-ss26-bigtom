import { useState, useEffect, useCallback } from 'react';
import type { BatchHistoryResponse, BatchSettings, BatchErrorDetail } from '../utils/types';

export const useBatchCorrection = (jobId: string | undefined, onSkipSuccess: () => void) => {
  const [history, setHistory] = useState<BatchHistoryResponse | null>(null);
  const [globalStatus, setGlobalStatus] = useState<string>('idle'); // 'idle' | 'running' | 'batch_done' | 'failed'
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<BatchErrorDetail | null>(null);

  const API_BASE = 'http://localhost:8000/api/v1'; // Passe deinen Port an

  // 1. Lade Batch-Historie
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
      setError(err || { error: 'UNKNOWN', message: 'Fehler beim Laden der Historie' });
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  // 2. Polling für den Job-Status (Läuft nur, wenn globalStatus === 'running')
  useEffect(() => {
    if (!jobId || globalStatus !== 'running') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/status/${jobId}`);
        if (res.ok) {
          const data = await res.json();
          // Wenn das Backend fertig ist, stoppe Polling und lade Historie neu
          if (data.status === 'batch_done' || data.status === 'filtering_done') {
            setGlobalStatus('batch_done');
            clearInterval(interval);
            fetchHistory();
          } else if (data.status === 'failed') {
            setGlobalStatus('failed');
            clearInterval(interval);
            setError({ error: 'BATCH_FAILED', message: 'Die Batch-Korrektur im Backend ist fehlgeschlagen.' });
          }
        }
      } catch (e) {
        console.error('Fehler beim Polling des Status:', e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, globalStatus, fetchHistory]);

  // Initialer Load
  useEffect(() => {
    if (jobId) {
      fetchHistory();
    }
  }, [jobId, fetchHistory]);

  // 3. Action: Batch-Korrektur starten
  const runBatch = async (settings: BatchSettings) => {
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
      
      // Erfolgreich gestartet -> Polling-Effekt greift durch Statuswechsel
      setGlobalStatus('running');
    } catch (err) {
      setGlobalStatus('idle');
      setError({ error: 'NETWORK_ERROR', message: 'Verbindung zum Server fehlgeschlagen.' });
    }
  };

  // 4. Action: Batch überspringen (Direkt zur Analyse)
  const skipBatch = async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`${API_BASE}/batch/${jobId}/skip`, { method: 'POST' });
      if (!res.ok) {
        const errData: BatchErrorDetail = await res.json();
        throw errData;
      }
      onSkipSuccess(); // Callback zur Navigation zur AnalysisPage
    } catch (err: any) {
      setError(err || { error: 'SKIP_FAILED', message: 'Überspringen fehlgeschlagen.' });
    }
  };

  return { history, globalStatus, loading, error, runBatch, skipBatch, setError };
};