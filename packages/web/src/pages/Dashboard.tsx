import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dashboard } from '../lib/api';

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

const interviewStatusColor: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  AWAITING_VALIDATION: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-red-100 text-red-600',
  ABANDONED: 'bg-orange-100 text-orange-700',
};

function MiniBar({ value, color = 'bg-[#1e3a5f]' }: { value: number; color?: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5">
      <div className={`${color} h-1.5 rounded-full`} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clientList, setClientList] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      dashboard.summary(),
      dashboard.clients(statusFilter || undefined),
    ]).then(([s, c]) => {
      setSummary(s);
      setClientList(c);
    }).finally(() => setLoading(false));
  }, [statusFilter]);

  if (loading && !summary) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  const cards = [
    { label: 'Total Clients', value: summary?.totalClients ?? 0, color: 'bg-blue-500' },
    { label: 'Active Interviews', value: summary?.activeInterviews ?? 0, color: 'bg-yellow-500' },
    { label: 'Reports Ready', value: summary?.reportsReady ?? 0, color: 'bg-green-500' },
    { label: 'High Priority', value: summary?.highPriority ?? 0, color: 'bg-red-500' },
  ];

  const statusOptions = ['', 'NEW', 'INTERVIEW_SENT', 'INTERVIEW_COMPLETE', 'REPORT_READY', 'ACTION_TAKEN', 'FOLLOW_UP', 'CLOSED'];

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
          <option value="">All statuses</option>
          {statusOptions.filter(Boolean).map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
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
          {clientList.map((client: any) => (
            <Link key={client.id} to={`/clients/${client.id}`}
              className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow">
              <div className="p-5">
                <div className="flex items-start justify-between">
                  {/* Left: Name, contact, status badges */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-base font-semibold text-gray-900 truncate">{client.name}</h3>
                      {client.classification && (
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium shrink-0 ${classBg[client.classification] || 'bg-gray-100 text-gray-700'}`}>
                          {classLabel[client.classification] || client.classification}
                        </span>
                      )}
                      {client.interviewStatus && (
                        <span className={`px-2 py-0.5 text-xs rounded-full shrink-0 ${interviewStatusColor[client.interviewStatus] || 'bg-gray-100 text-gray-600'}`}>
                          {client.interviewStatus.replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {[client.email, client.phone].filter(Boolean).join(' \u00B7 ') || 'No contact info'}
                      {' \u00B7 '}
                      {client.workflowStatus.replace(/_/g, ' ')}
                      {' \u00B7 '}
                      {new Date(client.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Right: Buyer Score */}
                  <div className="text-right ml-4 shrink-0">
                    {client.buyerScore != null ? (
                      <>
                        <p className="text-2xl font-bold text-green-600">{Math.round(client.buyerScore)}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Score</p>
                      </>
                    ) : client.interviewStatus === 'IN_PROGRESS' ? (
                      <>
                        <p className="text-2xl font-bold text-yellow-500">{Math.round(client.completionPercent)}%</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide">Progress</p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-300">--</p>
                    )}
                  </div>
                </div>

                {/* Score bars (if scoring exists) */}
                {client.scores && (
                  <div className="mt-3 grid grid-cols-4 gap-3">
                    {[
                      { label: 'MOT', value: client.scores.motivation },
                      { label: 'FIN', value: client.scores.financial },
                      { label: 'TML', value: client.scores.timeline },
                      { label: 'ENG', value: client.scores.engagement },
                    ].map((s) => (
                      <div key={s.label}>
                        <div className="flex justify-between mb-0.5">
                          <span className="text-[10px] text-gray-400 uppercase">{s.label}</span>
                          <span className="text-[10px] font-medium text-gray-600">{Math.round(s.value)}</span>
                        </div>
                        <MiniBar value={s.value} />
                      </div>
                    ))}
                  </div>
                )}

                {/* Interview progress bar (if in progress, no scores yet) */}
                {!client.scores && client.interviewStatus === 'IN_PROGRESS' && (
                  <div className="mt-3">
                    <div className="flex justify-between mb-0.5">
                      <span className="text-[10px] text-gray-400 uppercase">Interview Progress</span>
                      <span className="text-[10px] text-gray-500">{Math.round(client.completionPercent)}%</span>
                    </div>
                    <MiniBar value={client.completionPercent} color="bg-yellow-400" />
                  </div>
                )}

                {/* Summary snippet */}
                {client.summary && (
                  <p className="mt-2 text-xs text-gray-500 line-clamp-2">{client.summary}</p>
                )}

                {/* Action badges */}
                <div className="mt-3 flex items-center gap-2">
                  {client.recommendedAction && (
                    <span className={`text-xs font-medium ${
                      client.recommendedAction === 'SEND_TO_LENDER' ? 'text-green-600' :
                      client.recommendedAction === 'SCHEDULE_CONSULTATION' ? 'text-blue-600' :
                      'text-yellow-600'
                    }`}>
                      {client.recommendedAction === 'SEND_TO_LENDER' ? '\u2708 Send to lender' :
                       client.recommendedAction === 'SCHEDULE_CONSULTATION' ? '\uD83D\uDCC5 Schedule consultation' :
                       '\uD83D\uDD14 Follow up'}
                    </span>
                  )}
                  {client.reportId && client.reportStatus === 'READY' && (
                    <span className="text-xs text-green-600 font-medium">Report ready</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
