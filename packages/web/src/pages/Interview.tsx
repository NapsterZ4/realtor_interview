import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { interviews } from '../lib/api';

interface Message {
  role: 'ASSISTANT' | 'USER';
  content: string;
}

interface BuyerStrategy {
  buyerName: string;
  profileDescription: string;
  timeline: string;
  timelineNote: string;
  priceDescription: string;
  propertyLine: string;
  targetArea: string;
  preferencesNote: string;
  nextSteps: string[];
  realtorMessage: string;
}

function StrategyScreen({ strategy }: { strategy: BuyerStrategy }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-[#1e3a5f] to-blue-600 text-white">
        <div className="max-w-lg mx-auto px-6 py-10 text-center">
          <p className="text-blue-200 text-sm font-medium tracking-wide uppercase mb-1">Your Home Buying Strategy</p>
          <h1 className="text-3xl font-bold mb-2">Hi {strategy.buyerName}!</h1>
          <p className="text-blue-100 text-sm">{strategy.profileDescription}</p>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-4 pb-10 space-y-4">
        {/* Timeline & Price */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Timeline</p>
            <p className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
              <span>📅</span> {strategy.timeline}
            </p>
            {strategy.timelineNote && (
              <p className="text-xs text-gray-500 mt-0.5">{strategy.timelineNote}</p>
            )}
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-1">Price Range</p>
            <p className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
              <span>💰</span> {strategy.priceDescription}
            </p>
          </div>
        </div>

        {/* Property Preferences */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Property Preferences</p>
          <p className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
            <span>🏡</span> {strategy.propertyLine}
          </p>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
            <span>📍</span> {strategy.targetArea}
          </p>
          {strategy.preferencesNote && (
            <p className="text-sm text-gray-500 mt-2">{strategy.preferencesNote}</p>
          )}
        </div>

        {/* Next Steps */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-3 flex items-center gap-1">
            🎯 Your Next Steps
          </p>
          <div className="space-y-3">
            {strategy.nextSteps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-indigo-600">{i + 1}</span>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed">{step}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Realtor Message */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-xs font-semibold text-amber-800 mb-2">💬 A Message from Your Realtor</p>
          <p className="text-sm text-amber-900 italic leading-relaxed">"{strategy.realtorMessage}"</p>
        </div>

        {/* CTA */}
        <div className="text-center pt-2 space-y-3">
          <p className="text-xs text-gray-400">A confirmation email has been sent with your strategy.</p>
          <p className="text-xs text-gray-400">Your realtor will be in touch soon to get started!</p>
        </div>
      </div>
    </div>
  );
}

export default function Interview() {
  const { token } = useParams<{ token: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [completionPercent, setCompletionPercent] = useState(0);
  const [error, setError] = useState('');
  const [buyerStrategy, setBuyerStrategy] = useState<BuyerStrategy | null>(null);
  const [closing, setClosing] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    interviews.get(token).then((data) => {
      setStatus(data.status);
      setCompletionPercent(data.completionPercent || 0);
      if (data.messages) {
        setMessages(data.messages.filter((m: any) => m.role !== 'SYSTEM').map((m: any) => ({
          role: m.role,
          content: m.content,
        })));
      }
      // If already completed, show strategy
      if (data.status === 'COMPLETED' && data.buyerStrategy) {
        setBuyerStrategy(data.buyerStrategy);
      }
      if (data.status === 'PENDING') {
        setSending(true);
        interviews.sendMessage(token, 'Hello, I\'m ready to begin.').then((res) => {
          setMessages([{ role: 'ASSISTANT', content: res.reply }]);
          setStatus(res.status);
          setCompletionPercent(res.completionPercent || 0);
        }).finally(() => setSending(false));
      }
    }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !token || sending) return;
    const msg = input.trim();
    setInput('');
    setSending(true);

    setMessages((prev) => [...prev, { role: 'USER', content: msg }]);

    try {
      const res = await interviews.sendMessage(token, msg);
      setMessages((prev) => [...prev, { role: 'ASSISTANT', content: res.reply }]);
      setStatus(res.status);
      setCompletionPercent(res.completionPercent || 0);

      // Interview just completed
      if (res.status === 'COMPLETED' && res.buyerStrategy) {
        setClosing(true);
        setTimeout(() => {
          setBuyerStrategy(res.buyerStrategy);
        }, 3000);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-4 text-gray-500">Loading your interview...</p>
        </div>
      </div>
    );
  }

  // Show strategy screen
  if (buyerStrategy) {
    return <StrategyScreen strategy={buyerStrategy} />;
  }

  // Already completed but no strategy data (fallback)
  if (status === 'COMPLETED' && !closing) {
    return (
      <StrategyScreen strategy={{
        buyerName: 'there',
        profileDescription: 'Your buyer interview is complete.',
        timeline: 'Discussed',
        timelineNote: '',
        priceDescription: 'Discussed',
        propertyLine: 'See details with your realtor',
        targetArea: 'Discussed',
        preferencesNote: '',
        nextSteps: [
          'Your realtor will review your responses and preferences.',
          'They\'ll prepare personalized recommendations based on your needs.',
          'Expect to hear from them soon with next steps!',
        ],
        realtorMessage: 'Thank you for completing your buyer interview. I\'ll be in touch soon!',
      }} />
    );
  }

  if (status === 'EXPIRED') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Interview Expired</h1>
          <p className="text-gray-600">This interview link has expired. Please contact your realtor for a new link.</p>
        </div>
      </div>
    );
  }

  const isActive = !closing && (status === 'IN_PROGRESS' || status === 'PENDING' || status === 'ABANDONED');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-lg font-semibold text-gray-900">Buyer Interview</h1>
          <div className="mt-2 flex items-center space-x-3">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div className="bg-primary-600 h-2 rounded-full transition-all duration-500" style={{ width: `${completionPercent}%` }} />
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap">{Math.round(completionPercent)}%</span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === 'USER'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white shadow-sm border border-gray-200 text-gray-900'
              }`}>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-white shadow-sm border border-gray-200 rounded-2xl px-4 py-3">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          {/* Closing message */}
          {closing && (
            <div className="flex justify-center mt-6">
              <div className="bg-green-50 border border-green-200 rounded-2xl px-6 py-4 text-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600 mx-auto mb-2" />
                <p className="text-sm text-green-700 font-medium">Preparing your strategy...</p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      {isActive && (
        <div className="bg-white border-t px-4 py-3">
          <div className="max-w-2xl mx-auto flex space-x-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your response..."
              rows={1}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-full resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="px-6 py-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
