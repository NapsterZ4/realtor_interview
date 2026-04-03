import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { reports } from '../lib/api';

function ScoreBar({ label, value, max = 25 }: { label: string; value: number; max?: number }) {
  const scaled = Math.round((value / 100) * max);
  const pct = (scaled / max) * 100;
  return (
    <div className="border border-gray-200 rounded-xl p-4 flex flex-col justify-between">
      <div className="flex justify-between items-baseline mb-3">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-lg font-bold text-gray-900">
          {scaled}<span className="text-sm font-normal text-gray-400">/{max}</span>
        </span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2.5">
        <div className="bg-[#1e3a5f] h-2.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
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

export default function ReportView() {
  const { clientId, reportId } = useParams<{ clientId: string; reportId: string }>();
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId || !reportId) return;
    reports.get(clientId, reportId).then(setReport).finally(() => setLoading(false));
  }, [clientId, reportId]);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (!report?.reportData) return <div className="text-center py-12 text-red-500">Report not available</div>;

  const data = report.reportData;
  const snap = data.quickSnapshot;
  const scores = data.scores;
  const profile = data.buyerProfile;
  const financial = data.financialSnapshot;
  const property = data.propertyPreferences;

  const classLabel: Record<string, string> = {
    HIGH_PROBABILITY: 'High Probability',
    ACTIVE_BUYER: 'Active Buyer',
    EARLY_BUYER: 'Early Buyer',
    RESEARCH_STAGE: 'Research Stage',
  };

  const classBg: Record<string, string> = {
    HIGH_PROBABILITY: 'bg-green-500',
    ACTIVE_BUYER: 'bg-blue-500',
    EARLY_BUYER: 'bg-yellow-500',
    RESEARCH_STAGE: 'bg-gray-400',
  };

  const actionLabel: Record<string, string> = {
    SEND_TO_LENDER: 'Send to lender',
    SCHEDULE_CONSULTATION: 'Schedule consultation',
    ADD_TO_FOLLOW_UP: 'Add to follow-up',
  };

  const actionColor: Record<string, string> = {
    SEND_TO_LENDER: 'text-green-600',
    SCHEDULE_CONSULTATION: 'text-blue-600',
    ADD_TO_FOLLOW_UP: 'text-yellow-600',
  };

  const lenderObj: Record<string, any> = {};
  if (financial.preapproval && financial.preapproval !== 'Not specified') {
    lenderObj.pre_approved = financial.preapproval.toLowerCase().includes('yes') || financial.preapproval.toLowerCase().includes('approved');
  } else {
    lenderObj.pre_approved = false;
  }
  if (financial.budgetRange !== 'Not specified') lenderObj.estimated_budget = financial.budgetRange;
  if (financial.downPayment !== 'Not specified') lenderObj.down_payment_ready = !financial.downPayment.toLowerCase().includes('no');

  return (
    <div className="max-w-5xl mx-auto">
      <Link to={`/clients/${clientId}`} className="text-sm text-gray-400 hover:text-gray-600 mb-4 inline-block">&larr; Back to Client</Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{snap.buyerName}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {data.contactEmail && <span>{data.contactEmail}</span>}
            {data.contactEmail && data.contactPhone && <span> &middot; </span>}
            {data.contactPhone && <span>{data.contactPhone}</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-5xl font-bold text-green-600">{Math.round(snap.score)}</p>
          <p className="text-xs text-gray-500 mt-1">Buyer Score</p>
          <span className={`inline-block mt-1 px-3 py-0.5 rounded-full text-xs font-medium text-white ${classBg[snap.classification] || 'bg-gray-400'}`}>
            {classLabel[snap.classification] || snap.classification}
          </span>
        </div>
      </div>

      {/* Recommended Action */}
      <div className="border border-gray-200 rounded-xl p-5 mb-6 flex items-center gap-4 bg-gray-50">
        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm text-xl">
          {snap.recommendedAction === 'SEND_TO_LENDER' ? '\u2708' :
           snap.recommendedAction === 'SCHEDULE_CONSULTATION' ? '\uD83D\uDCC5' : '\uD83D\uDD14'}
        </div>
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Recommended Action</p>
          <p className={`text-lg font-semibold ${actionColor[snap.recommendedAction] || 'text-gray-900'}`}>
            {actionLabel[snap.recommendedAction] || snap.recommendedAction.replace(/_/g, ' ')}
          </p>
        </div>
      </div>

      {/* Score Bars */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <ScoreBar label="Motivation" value={scores.motivationScore} />
        <ScoreBar label="Financial" value={scores.financialReadiness} />
        <ScoreBar label="Timeline" value={scores.timelineScore} />
        <ScoreBar label="Engagement" value={scores.engagementScore} />
      </div>

      {/* Buyer Profile + Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card icon="\uD83D\uDCCB" title="Buyer Profile">
          <dl className="space-y-3 text-sm">
            <div className="flex">
              <dt className="text-gray-500 w-28 shrink-0">Type:</dt>
              <dd className="font-medium text-gray-900">{profile.buyerType}</dd>
            </div>
            <div className="flex">
              <dt className="text-gray-500 w-28 shrink-0">Timeline:</dt>
              <dd className="font-medium text-gray-900">{profile.timeline}</dd>
            </div>
            <div className="flex">
              <dt className="text-gray-500 w-28 shrink-0">Financial:</dt>
              <dd className="font-medium text-gray-900">{financial.clarity.toLowerCase()}</dd>
            </div>
            <div className="flex">
              <dt className="text-gray-500 w-28 shrink-0">Price Range:</dt>
              <dd className="font-medium text-gray-900">{financial.budgetRange}</dd>
            </div>
            <div className="flex">
              <dt className="text-gray-500 w-28 shrink-0">Locations:</dt>
              <dd className="font-medium text-gray-900">{property.area}</dd>
            </div>
          </dl>
        </Card>

        <Card icon="\uD83D\uDCDD" title="Summary">
          <p className="text-sm text-gray-600 leading-relaxed">{data.summary || 'No summary available.'}</p>
        </Card>
      </div>

      {/* Lender Snapshot + MLS Criteria + Consultation Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card icon="$" title="Lender Snapshot">
          <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-mono">
{JSON.stringify(lenderObj, null, 2)}
          </pre>
        </Card>

        <Card icon="\uD83D\uDD0D" title="MLS Criteria">
          <pre className="text-xs text-gray-700 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-mono">
{JSON.stringify(data.mlsCriteria || {}, null, 2)}
          </pre>
        </Card>

        <Card icon="\uD83D\uDCCD" title="Consultation Notes">
          <p className="text-sm text-gray-600 leading-relaxed">{data.consultationNotes || 'No notes available.'}</p>
        </Card>
      </div>
    </div>
  );
}
