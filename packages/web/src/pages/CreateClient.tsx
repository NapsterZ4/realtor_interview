import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clients, interviews } from '../lib/api';

export default function CreateClient() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', leadSource: '', preferredLanguage: 'en', notes: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shareModal, setShareModal] = useState<{ url: string; clientId: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const client = await clients.create({
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        leadSource: form.leadSource || undefined,
        preferredLanguage: form.preferredLanguage,
        notes: form.notes || undefined,
      });
      const session = await interviews.create(client.id);
      setShareModal({ url: session.interviewUrl, clientId: client.id });
    } catch (err: any) {
      setError(err.message || 'Failed to create client');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (shareModal) {
      navigator.clipboard.writeText(shareModal.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (shareModal) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Client Created!</h2>
          <p className="text-gray-600 mb-6">Share this interview link with your client:</p>
          <div className="flex items-center space-x-2 mb-6">
            <input
              readOnly
              value={shareModal.url}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm"
            />
            <button onClick={copyLink}
              className="px-4 py-2 bg-primary-600 text-white rounded-md text-sm hover:bg-primary-700">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="flex space-x-3 justify-center">
            {form.email && (
              <a href={`mailto:${form.email}?subject=Your%20Buyer%20Qualification%20Interview&body=Please%20complete%20your%20interview:%20${encodeURIComponent(shareModal.url)}`}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50">
                Email Link
              </a>
            )}
            {form.phone && (
              <a href={`sms:${form.phone}?body=Please%20complete%20your%20buyer%20qualification%20interview:%20${shareModal.url}`}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50">
                SMS Link
              </a>
            )}
            <button onClick={() => navigate(`/clients/${shareModal.clientId}`)}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50">
              View Client
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create New Client</h1>
      <form className="bg-white rounded-lg shadow p-6 space-y-4" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">{error}</div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700">Name *</label>
          <input type="text" required value={form.name} onChange={update('name')}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input type="email" value={form.email} onChange={update('email')}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Phone</label>
          <input type="tel" value={form.phone} onChange={update('phone')}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Lead Source</label>
          <input type="text" value={form.leadSource} onChange={update('leadSource')} placeholder="e.g., Zillow, Referral, Open House"
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Preferred Language</label>
          <select value={form.preferredLanguage} onChange={update('preferredLanguage')}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500">
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="zh">Chinese</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Notes</label>
          <textarea value={form.notes} onChange={update('notes')} rows={3}
            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500" />
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50">
          {loading ? 'Creating...' : 'Create Client & Generate Interview Link'}
        </button>
      </form>
    </div>
  );
}
