import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { dashboard, clients as clientsApi, workflow as workflowApi } from '../lib/api';

interface Summary {
  totalClients: number;
  activeInterviews: number;
  reportsReady: number;
  highPriority: number;
}

const classLabel: Record<string, string> = {
  HIGH_PROBABILITY: 'High Probability',
  ACTIVE_BUYER: 'Active Buyer',
  EARLY_BUYER: 'Early Buyer',
  RESEARCH_STAGE: 'Research Stage',
};

const classBg: Record<string, string> = {
  HIGH_PROBABILITY: 'bg-green-100 text-green-800',
  ACTIVE_BUYER: 'bg-blue-100 text-blue-800',
  EARLY_BUYER: 'bg-yellow-100 text-yellow-800',
  RESEARCH_STAGE: 'bg-gray-100 text-gray-700',
};

const pipelineStatusLabel: Record<string, string> = {
  SENT: 'Sent',
  ANSWERED: 'Answered',
  FOLLOW_UP: 'Follow Up',
  CLOSED: 'Closed',
};

const pipelineStatusColor: Record<string, string> = {
  SENT: 'bg-blue-100 text-blue-700',
  ANSWERED: 'bg-green-100 text-green-700',
  FOLLOW_UP: 'bg-amber-100 text-amber-700',
  CLOSED: 'bg-gray-200 text-gray-700',
};

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-blue-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-red-500';
}

function barColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-blue-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-400';
}

function MiniBar({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-[10px] text-gray-400 uppercase">{label}</span>
        <span className="text-[10px] font-medium text-gray-600">{Math.round(value)}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-1.5">
        <div className={`${barColor(value)} h-1.5 rounded-full transition-all`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
    </div>
  );
}

function ActionsMenu({
  client,
  onDelete,
  onSetStatus,
}: {
  client: any;
  onDelete: (id: string) => void;
  onSetStatus: (id: string, status: 'SENT' | 'ANSWERED' | 'FOLLOW_UP' | 'CLOSED') => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const interviewUrl = client.interviewToken
    ? `${window.location.origin}/interview/${client.interviewToken}`
    : null;

  const handleCopy = () => {
    if (!interviewUrl) return;
    navigator.clipboard.writeText(interviewUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onDelete(client.id);
    setOpen(false);
    setConfirming(false);
  };

  const handleSetStatus = async (status: 'SENT' | 'ANSWERED' | 'FOLLOW_UP' | 'CLOSED') => {
    if (updatingStatus) return;
    setUpdatingStatus(true);
    try {
      await onSetStatus(client.id, status);
      setOpen(false);
      setConfirming(false);
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); setConfirming(false); }}
        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        title="Actions"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 w-72 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          {/* Interview Link */}
          {interviewUrl ? (
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Interview Link</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={interviewUrl}
                  className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-gray-600 truncate"
                  onFocus={(e) => e.target.select()}
                />
                <button
                  onClick={handleCopy}
                  className={`shrink-0 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                    copied ? 'bg-green-100 text-green-700' : 'bg-primary-50 text-primary-700 hover:bg-primary-100'
                  }`}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          ) : (
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-xs text-gray-400">No interview created yet</p>
            </div>
          )}

          {/* Delete */}
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1.5">Set Status</p>
            <div className="flex flex-col gap-1">
              {(['SENT', 'ANSWERED', 'FOLLOW_UP', 'CLOSED'] as const).map((status) => (
                <button
                  key={status}
                  disabled={updatingStatus}
                  onClick={() => handleSetStatus(status)}
                  className="w-full text-left px-2 py-1.5 rounded text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {pipelineStatusLabel[status]}
                </button>
              ))}
            </div>
          </div>

          {/* Delete */}
          <button
            onClick={handleDelete}
            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
              confirming
                ? 'bg-red-50 text-red-700 font-medium'
                : 'text-red-600 hover:bg-red-50'
            }`}
          >
            {confirming ? 'Click again to confirm delete' : 'Delete client'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clientList, setClientList] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    setLoading(true);
    const [s, c] = await Promise.all([
      dashboard.summary(),
      dashboard.clients(statusFilter || undefined),
    ]);
    setSummary(s);
    setClientList(c);
    setLoading(false);
  };

  useEffect(() => {
    loadData().catch(() => setLoading(false));
  }, [statusFilter]);

  const handleDelete = async (clientId: string) => {
    try {
      await clientsApi.delete(clientId);
      setClientList((prev) => prev.filter((c) => c.id !== clientId));
      if (summary) {
        setSummary({ ...summary, totalClients: summary.totalClients - 1 });
      }
    } catch (e: any) {
      alert('Failed to delete: ' + e.message);
    }
  };

  const handleSetStatus = async (clientId: string, status: 'SENT' | 'ANSWERED' | 'FOLLOW_UP' | 'CLOSED') => {
    try {
      await workflowApi.setStatus(clientId, status);
      await loadData();
    } catch (e: any) {
      alert('Failed to update status: ' + e.message);
    }
  };

  if (loading && !summary) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  const cards = [
    { label: 'Total Clients', value: summary?.totalClients ?? 0, color: 'bg-blue-500' },
    { label: 'Active Interviews', value: summary?.activeInterviews ?? 0, color: 'bg-yellow-500' },
    { label: 'Reports Ready', value: summary?.reportsReady ?? 0, color: 'bg-green-500' },
    { label: 'High Priority', value: summary?.highPriority ?? 0, color: 'bg-red-500' },
  ];

  const statusOptions = [
    { value: '', label: 'All Statuses' },
    { value: 'SENT', label: 'Sent' },
    { value: 'ANSWERED', label: 'Answered' },
    { value: 'FOLLOW_UP', label: 'Follow Up' },
    { value: 'CLOSED', label: 'Closed' },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Link to="/clients/new"
          className="bg-primary-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-primary-700">
          New Client
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className={`${card.color} rounded-full w-3 h-3 mr-3`} />
              <span className="text-sm text-gray-500">{card.label}</span>
            </div>
            <p className="mt-2 text-3xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-gray-900">Clients</h2>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Client Cards */}
      {clientList.length === 0 ? (
        <div className="bg-white rounded-lg shadow px-6 py-12 text-center text-gray-500">
          No clients yet. <Link to="/clients/new" className="text-primary-600 hover:underline">Create your first client</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {clientList.map((client: any) => {
            const hasScore = client.buyerScore != null;

            return (
              <div key={client.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: Name, contact, status badges */}
                    <Link to={`/clients/${client.id}`} className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <h3 className="text-base font-semibold text-gray-900 truncate">{client.name}</h3>
                        {client.classification && (
                          <span className={`px-2 py-0.5 text-xs rounded-full font-medium shrink-0 ${classBg[client.classification] || 'bg-gray-100 text-gray-700'}`}>
                            {classLabel[client.classification] || client.classification}
                          </span>
                        )}
                        {client.pipelineStatus && (
                          <span className={`px-2 py-0.5 text-xs rounded-full shrink-0 ${pipelineStatusColor[client.pipelineStatus] || 'bg-gray-100 text-gray-600'}`}>
                            {pipelineStatusLabel[client.pipelineStatus] || client.pipelineStatus}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        {[client.email, client.phone].filter(Boolean).join(' · ') || 'No contact info'}
                        {' · '}
                        {pipelineStatusLabel[client.pipelineStatus] || client.pipelineStatus || 'Sent'}
                        {' · '}
                        {new Date(client.createdAt).toLocaleDateString()}
                      </p>
                    </Link>

                    {/* Right: Buyer Score + Actions */}
                    <div className="flex items-start gap-3 shrink-0">
                      <div className="min-w-[130px]">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Status</p>
                        <select
                          value={client.pipelineStatus || 'SENT'}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onChange={(e) => {
                            const next = e.target.value as 'SENT' | 'ANSWERED' | 'FOLLOW_UP' | 'CLOSED';
                            handleSetStatus(client.id, next);
                          }}
                          className="w-full border border-gray-300 rounded-md px-2 py-1 text-xs bg-white"
                        >
                          <option value="SENT">Sent</option>
                          <option value="ANSWERED">Answered</option>
                          <option value="FOLLOW_UP">Follow Up</option>
                          <option value="CLOSED">Closed</option>
                        </select>
                      </div>

                      <div className="text-right">
                        {hasScore ? (
                          <>
                            <p className={`text-2xl font-bold ${scoreColor(client.buyerScore)}`}>
                              {Math.round(client.buyerScore)}
                            </p>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Buyer Score</p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-300 mt-1">--</p>
                        )}
                      </div>
                      <ActionsMenu client={client} onDelete={handleDelete} onSetStatus={handleSetStatus} />
                    </div>
                  </div>

                  <Link to={`/clients/${client.id}`}>
                    {/* Score bars */}
                    {client.scores && (
                      <div className="mt-3 grid grid-cols-4 gap-3">
                        <MiniBar label="Motivation" value={client.scores.motivation} />
                        <MiniBar label="Financial" value={client.scores.financial} />
                        <MiniBar label="Timeline" value={client.scores.timeline} />
                        <MiniBar label="Engagement" value={client.scores.engagement} />
                      </div>
                    )}

                    {/* No signals — show interview progress */}
                    {!client.scores && client.interviewStatus === 'IN_PROGRESS' && (
                      <div className="mt-3">
                        <div className="flex justify-between mb-0.5">
                          <span className="text-[10px] text-gray-400 uppercase">Interview Progress</span>
                          <span className="text-[10px] text-gray-500">{Math.round(client.completionPercent)}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-1.5">
                          <div className="bg-yellow-400 h-1.5 rounded-full transition-all" style={{ width: `${client.completionPercent}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Summary snippet */}
                    {client.summary && (
                      <p className="mt-2 text-xs text-gray-500 line-clamp-2">{client.summary}</p>
                    )}

                    {/* Action badges */}
                    {(client.recommendedAction || (client.reportId && client.reportStatus === 'READY')) && (
                      <div className="mt-3 flex items-center gap-2">
                        {client.recommendedAction && (
                          <span className={`text-xs font-medium ${
                            client.recommendedAction === 'SEND_TO_LENDER' ? 'text-green-600' :
                            client.recommendedAction === 'SCHEDULE_CONSULTATION' ? 'text-blue-600' :
                            'text-yellow-600'
                          }`}>
                            {client.recommendedAction === 'SEND_TO_LENDER' ? '✈️ Send to lender' :
                             client.recommendedAction === 'SCHEDULE_CONSULTATION' ? '📅 Schedule consultation' :
                             '🔔 Follow up'}
                          </span>
                        )}
                        {client.reportId && client.reportStatus === 'READY' && (
                          <span className="text-xs text-green-600 font-medium">Report ready</span>
                        )}
                      </div>
                    )}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
