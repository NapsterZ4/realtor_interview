import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { clients as clientsApi, interviews, reports, workflow as workflowApi } from '../lib/api';

/* ── helpers ── */

function getSignal(signals: any[], key: string): string {
  const s = signals.find((s: any) => s.signalKey === key);
  return s?.signalValue ?? '';
}

function buildLiveProfile(signals: any[]) {
  const buyerType = getSignal(signals, 'buyer_type') || 'Unknown';
  const motivation = getSignal(signals, 'motivation') || 'Not specified';
  const timeline = getSignal(signals, 'timeline') || 'Not specified';
  const targetArea = getSignal(signals, 'target_area') || 'Not specified';
  const propertyType = getSignal(signals, 'property_type') || 'Not specified';
  const financingIntent = getSignal(signals, 'financing_intent') || 'Not specified';
  const financialIndicator = getSignal(signals, 'financial_indicator') || 'Not specified';
  const budgetRange = getSignal(signals, 'budget_range') || 'Not specified';
  const preapproval = getSignal(signals, 'preapproval_status') || 'Not specified';
  const downPayment = getSignal(signals, 'down_payment') || 'Not specified';
  const bedrooms = getSignal(signals, 'bedrooms');
  const bathrooms = getSignal(signals, 'bathrooms');
  const mustHaves = getSignal(signals, 'must_haves');
  const dealBreakers = getSignal(signals, 'deal_breakers');

  // Derive scores from signal category confidence
  const catScores: Record<string, number[]> = {};
  for (const s of signals) {
    if (!catScores[s.signalCategory]) catScores[s.signalCategory] = [];
    catScores[s.signalCategory].push(s.confidence * 100);
  }
  const avg = (cat: string) => {
    const arr = catScores[cat];
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a: number, b: number) => a + b, 0) / arr.length;
  };

  const motivationScore = avg('BUYER_MOTIVATION');
  const financialReadiness = avg('FINANCIAL_READINESS');
  const timelineScore = avg('TIMELINE');
  const engagementScore = avg('ENGAGEMENT') || avg('BEHAVIORAL') || (signals.length > 0 ? 50 : 0);

  const composite = motivationScore * 0.30 + financialReadiness * 0.35 + engagementScore * 0.15 + timelineScore * 0.20;

  const classification = composite >= 80 ? 'HIGH_PROBABILITY' :
    composite >= 60 ? 'ACTIVE_BUYER' :
    composite >= 40 ? 'EARLY_BUYER' : 'RESEARCH_STAGE';

  // Financial clarity
  const finSignals = ['financing_intent', 'financial_indicator', 'budget_range', 'preapproval_status', 'down_payment'];
  const finFound = finSignals.filter(k => getSignal(signals, k) !== '').length;
  const clarity = finFound >= 4 ? 'high' : finFound >= 2 ? 'moderate' : 'low';

  const hasPreapproval = preapproval.toLowerCase().includes('yes') || preapproval.toLowerCase().includes('approved');

  // Action
  let action = 'SCHEDULE_CONSULTATION';
  if (classification === 'HIGH_PROBABILITY' && clarity !== 'low' && (hasPreapproval || financialReadiness >= 60)) {
    action = 'SEND_TO_LENDER';
  } else if (classification === 'EARLY_BUYER' || classification === 'RESEARCH_STAGE') {
    action = 'ADD_TO_FOLLOW_UP';
  }

  // Summary
  const summaryParts: string[] = [];
  if (buyerType !== 'Unknown') summaryParts.push(`${buyerType} buyer`);
  if (motivation !== 'Not specified') summaryParts.push(`motivated by ${motivation.toLowerCase()}`);
  if (timeline !== 'Not specified') summaryParts.push(`with a ${timeline.toLowerCase()} timeline`);
  if (targetArea !== 'Not specified') summaryParts.push(`looking in ${targetArea}`);
  if (propertyType !== 'Not specified') summaryParts.push(`seeking a ${propertyType.toLowerCase()}`);
  if (budgetRange !== 'Not specified') summaryParts.push(`around ${budgetRange}`);
  const summary = summaryParts.length > 0 ? summaryParts.join(', ') + '.' : '';

  // MLS
  const mlsCriteria: Record<string, string> = {};
  if (bedrooms) mlsCriteria.bedrooms = bedrooms;
  if (bathrooms) mlsCriteria.bathrooms = bathrooms;
  if (propertyType !== 'Not specified') mlsCriteria.property_type = propertyType.toLowerCase();
  if (targetArea !== 'Not specified') mlsCriteria.location = targetArea;
  if (budgetRange !== 'Not specified') mlsCriteria.price_range = budgetRange;
  if (mustHaves) mlsCriteria.features = mustHaves;

  // Lender
  const lenderObj: Record<string, any> = { pre_approved: hasPreapproval };
  if (budgetRange !== 'Not specified') lenderObj.estimated_budget = budgetRange;
  if (downPayment !== 'Not specified') lenderObj.down_payment_ready = !downPayment.toLowerCase().includes('no');

  // Consultation notes
  const notes: string[] = [];
  if (buyerType !== 'Unknown') notes.push(`Buyer type: ${buyerType}.`);
  if (motivation !== 'Not specified') notes.push(`Primary motivation: ${motivation}.`);
  if (timeline !== 'Not specified') notes.push(`Timeline: ${timeline}.`);
  if (financingIntent !== 'Not specified') notes.push(`Financing: ${financingIntent}.`);
  if (preapproval !== 'Not specified') notes.push(`Pre-approval: ${preapproval}.`);
  if (dealBreakers) notes.push(`Deal breakers: ${dealBreakers}.`);
  const consultationNotes = notes.join(' ');

  return {
    scores: { motivationScore, financialReadiness, timelineScore, engagementScore },
    composite: Math.round(composite),
    classification,
    action,
    profile: { buyerType, timeline, clarity, budgetRange, targetArea, propertyType },
    summary,
    mlsCriteria,
    lenderObj,
    consultationNotes,
  };
}

/* ── components ── */

function ScoreBar({ label, value, max = 25 }: { label: string; value: number; max?: number }) {
  const scaled = Math.round((value / 100) * max);
  const pct = (scaled / max) * 100;
  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex justify-between items-baseline mb-3">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-lg font-bold text-gray-900">
          {scaled}<span className="text-sm font-normal text-gray-400">/{max}</span>
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5">
        <div className="bg-[#1e3a5f] h-2.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Card({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-xl p-6">
      <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span>{icon}</span> {title}
      </h3>
      {children}
    </div>
  );
}

const classLabel: Record<string, string> = {
  HIGH_PROBABILITY: 'High Probability', ACTIVE_BUYER: 'Active Buyer',
  EARLY_BUYER: 'Early Buyer', RESEARCH_STAGE: 'Research Stage',
};
const classBg: Record<string, string> = {
  HIGH_PROBABILITY: 'bg-green-500', ACTIVE_BUYER: 'bg-blue-500',
  EARLY_BUYER: 'bg-yellow-500', RESEARCH_STAGE: 'bg-gray-400',
};
const actionLabel: Record<string, string> = {
  SEND_TO_LENDER: 'Send to lender', SCHEDULE_CONSULTATION: 'Schedule consultation',
  ADD_TO_FOLLOW_UP: 'Add to follow-up',
};
const actionColor: Record<string, string> = {
  SEND_TO_LENDER: 'text-green-600', SCHEDULE_CONSULTATION: 'text-blue-600',
  ADD_TO_FOLLOW_UP: 'text-yellow-600',
};
const statusBadge: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700', IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700', EXPIRED: 'bg-red-100 text-red-700',
  ABANDONED: 'bg-orange-100 text-orange-700',
};

/* ── main ── */

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!id) return;
    clientsApi.get(id).then(setClient).catch((e: any) => setError(e.message)).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleGenerateReport = async () => {
    if (!id) return;
    setActionLoading('report');
    try { await reports.generate(id); load(); } catch (e: any) { setError(e.message); } finally { setActionLoading(''); }
  };
  const handleCreateInterview = async () => {
    if (!id) return;
    setActionLoading('interview');
    try {
      const session = await interviews.create(id);
      load();
      navigator.clipboard.writeText(session.interviewUrl);
      alert('Interview link copied to clipboard!');
    } catch (e: any) { setError(e.message); } finally { setActionLoading(''); }
  };
  const handleExecuteAction = async () => {
    if (!id) return;
    setActionLoading('execute');
    try { await workflowApi.execute(id); load(); } catch (e: any) { setError(e.message); } finally { setActionLoading(''); }
  };

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (!client) return <div className="text-center py-12 text-red-500">{error || 'Client not found'}</div>;

  const latestSession = client.interviewSessions?.[0];
  const latestReport = client.reports?.find((r: any) => r.status === 'READY');
  const reportData = latestReport?.reportData;
  const wf = client.clientWorkflow;

  // Use report data if available, otherwise build live from signals
  const hasReport = !!reportData;
  const signals = latestSession?.extractedSignals ?? [];
  const hasSignals = signals.length > 0;

  // Get display data: from report or from live signals
  let displayData: any = null;
  if (hasReport) {
    const snap = reportData.quickSnapshot;
    const scores = reportData.scores;
    const profile = reportData.buyerProfile;
    const financial = reportData.financialSnapshot;
    const property = reportData.propertyPreferences;
    const lenderObj: Record<string, any> = { pre_approved: false };
    if (financial?.preapproval && financial.preapproval !== 'Not specified') {
      lenderObj.pre_approved = financial.preapproval.toLowerCase().includes('yes') || financial.preapproval.toLowerCase().includes('approved');
    }
    if (financial?.budgetRange !== 'Not specified') lenderObj.estimated_budget = financial.budgetRange;
    if (financial?.downPayment !== 'Not specified') lenderObj.down_payment_ready = !financial.downPayment.toLowerCase().includes('no');

    displayData = {
      composite: Math.round(snap.score),
      classification: snap.classification,
      action: snap.recommendedAction,
      scores: {
        motivationScore: scores.motivationScore,
        financialReadiness: scores.financialReadiness,
        timelineScore: scores.timelineScore,
        engagementScore: scores.engagementScore,
      },
      profile: {
        buyerType: profile.buyerType,
        timeline: profile.timeline,
        clarity: financial.clarity.toLowerCase(),
        budgetRange: financial.budgetRange,
        targetArea: property.area,
        propertyType: property.type,
      },
      summary: reportData.summary || '',
      mlsCriteria: reportData.mlsCriteria || {},
      lenderObj,
      consultationNotes: reportData.consultationNotes || '',
    };
  } else if (hasSignals) {
    displayData = buildLiveProfile(signals);
  }

  const showReportLayout = !!displayData && (displayData.composite > 0 || hasSignals);

  return (
    <div className="max-w-5xl mx-auto">
      <Link to="/" className="text-sm text-gray-400 hover:text-gray-600 mb-4 inline-block">&larr; Back to Dashboard</Link>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-4">{error}</div>}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {[client.email, client.phone].filter(Boolean).join(' · ') || 'No contact info'}
          </p>
        </div>
        <div className="text-right">
          {showReportLayout ? (
            <>
              <p className="text-5xl font-bold text-green-600">{displayData.composite}</p>
              <p className="text-xs text-gray-500 mt-1">Buyer Score</p>
              <span className={`inline-block mt-1 px-3 py-0.5 rounded-full text-xs font-medium text-white ${classBg[displayData.classification] || 'bg-gray-400'}`}>
                {classLabel[displayData.classification] || displayData.classification}
              </span>
              {!hasReport && latestSession && (
                <p className="text-[10px] text-yellow-500 mt-1">Live preview · {Math.round(latestSession.completionPercent)}% complete</p>
              )}
            </>
          ) : latestSession ? (
            <>
              <p className="text-3xl font-bold text-yellow-500">{Math.round(latestSession.completionPercent)}%</p>
              <p className="text-xs text-gray-500 mt-1">Interview Progress</p>
              <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs ${statusBadge[latestSession.status] || 'bg-gray-100'}`}>
                {latestSession.status.replace(/_/g, ' ')}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {/* Report-style layout */}
      {showReportLayout && (
        <>
          {/* Recommended Action */}
          <div className="border border-gray-200 rounded-xl p-5 mb-6 flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-xl">
                {displayData.action === 'SEND_TO_LENDER' ? '✈️' :
                 displayData.action === 'SCHEDULE_CONSULTATION' ? '📅' : '🔔'}
              </div>
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Recommended Action</p>
                <p className={`text-lg font-semibold ${actionColor[displayData.action] || 'text-gray-900'}`}>
                  {actionLabel[displayData.action] || displayData.action.replace(/_/g, ' ')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {latestSession?.status === 'COMPLETED' && !hasReport && (
                <button onClick={handleGenerateReport} disabled={actionLoading === 'report'}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                  {actionLoading === 'report' ? 'Generating...' : 'Generate Report'}
                </button>
              )}
              {wf?.status === 'REPORT_READY' && (
                <button onClick={handleExecuteAction} disabled={actionLoading === 'execute'}
                  className="px-5 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                  {actionLoading === 'execute' ? 'Executing...' : 'Execute Action'}
                </button>
              )}
              {wf?.status === 'ACTION_TAKEN' && (
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Completed</span>
              )}
            </div>
          </div>

          {/* Interview progress (if still in progress) */}
          {latestSession && latestSession.status !== 'COMPLETED' && (
            <div className="mb-6">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Interview {latestSession.status.replace(/_/g, ' ').toLowerCase()}</span>
                <span>{Math.round(latestSession.completionPercent)}% complete</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-yellow-400 h-2 rounded-full transition-all" style={{ width: `${latestSession.completionPercent}%` }} />
              </div>
            </div>
          )}

          {/* Score Bars */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <ScoreBar label="Motivation" value={displayData.scores.motivationScore} />
            <ScoreBar label="Financial" value={displayData.scores.financialReadiness} />
            <ScoreBar label="Timeline" value={displayData.scores.timelineScore} />
            <ScoreBar label="Engagement" value={displayData.scores.engagementScore} />
          </div>

          {/* Buyer Profile + Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Card icon="📋" title="Buyer Profile">
              <dl className="space-y-3 text-sm">
                <div className="flex"><dt className="text-gray-500 w-28 shrink-0">Type:</dt><dd className="font-medium text-gray-900">{displayData.profile.buyerType}</dd></div>
                <div className="flex"><dt className="text-gray-500 w-28 shrink-0">Timeline:</dt><dd className="font-medium text-gray-900">{displayData.profile.timeline}</dd></div>
                <div className="flex"><dt className="text-gray-500 w-28 shrink-0">Financial:</dt><dd className="font-medium text-gray-900">{displayData.profile.clarity}</dd></div>
                <div className="flex"><dt className="text-gray-500 w-28 shrink-0">Price Range:</dt><dd className="font-medium text-gray-900">{displayData.profile.budgetRange}</dd></div>
                <div className="flex"><dt className="text-gray-500 w-28 shrink-0">Locations:</dt><dd className="font-medium text-gray-900">{displayData.profile.targetArea}</dd></div>
              </dl>
            </Card>

            <Card icon="📝" title="Summary">
              <p className="text-sm text-gray-600 leading-relaxed">
                {displayData.summary || 'Summary will appear as the interview progresses.'}
              </p>
            </Card>
          </div>

          {/* Lender + MLS + Notes */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <Card icon="$" title="Lender Snapshot">
              <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-mono">
{JSON.stringify(displayData.lenderObj, null, 2)}
              </pre>
            </Card>

            <Card icon="🔍" title="MLS Criteria">
              <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-mono">
{JSON.stringify(displayData.mlsCriteria, null, 2)}
              </pre>
            </Card>

            <Card icon="📍" title="Consultation Notes">
              <p className="text-sm text-gray-600 leading-relaxed">
                {displayData.consultationNotes || 'Notes will appear as signals are extracted.'}
              </p>
            </Card>
          </div>

          {latestReport && (
            <div className="flex justify-end">
              <Link to={`/clients/${id}/reports/${latestReport.id}`}
                className="text-sm text-primary-600 hover:text-primary-800 font-medium">
                View Full Report &rarr;
              </Link>
            </div>
          )}
        </>
      )}

      {/* No signals yet — show basic cards */}
      {!showReportLayout && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <Card icon="👤" title="Client Info">
            <dl className="space-y-3 text-sm">
              <div><dt className="text-gray-500">Email</dt><dd className="font-medium">{client.email || '-'}</dd></div>
              <div><dt className="text-gray-500">Phone</dt><dd className="font-medium">{client.phone || '-'}</dd></div>
              <div><dt className="text-gray-500">Lead Source</dt><dd className="font-medium">{client.leadSource || '-'}</dd></div>
              <div><dt className="text-gray-500">Language</dt><dd className="font-medium">{client.preferredLanguage}</dd></div>
              {client.notes && <div><dt className="text-gray-500">Notes</dt><dd className="font-medium">{client.notes}</dd></div>}
            </dl>
          </Card>

          <Card icon="💬" title="Interview">
            {latestSession ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Status</span>
                  <span className={`px-2 py-1 text-xs rounded-full ${statusBadge[latestSession.status] || 'bg-gray-100'}`}>
                    {latestSession.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-sm text-gray-500">Waiting for buyer to begin the interview.</p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-3">No interview yet</p>
                <button onClick={handleCreateInterview} disabled={actionLoading === 'interview'}
                  className="py-2 px-4 bg-primary-600 text-white rounded-md text-sm hover:bg-primary-700 disabled:opacity-50">
                  {actionLoading === 'interview' ? 'Creating...' : 'Create Interview'}
                </button>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
