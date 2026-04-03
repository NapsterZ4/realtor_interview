import { createTransport } from 'nodemailer';

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

interface CompletionEmailData {
  buyerName: string;
  buyerEmail: string;
  strategy: BuyerStrategy;
  realtorName: string;
  realtorEmail: string;
  realtorPhone: string | null;
  realtorCompany: string | null;
}

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendCompletionEmail(data: CompletionEmailData): Promise<void> {
  const transport = getTransport();
  const s = data.strategy;

  if (!transport) {
    console.log('[Email] SMTP not configured. Would have sent completion email to:', data.buyerEmail);
    console.log('[Email] Strategy:', s.profileDescription, '-', s.timeline);
    return;
  }

  const nextStepsHtml = s.nextSteps.map((step, i) => `
    <tr>
      <td style="padding: 8px 12px 8px 0; vertical-align: top;">
        <div style="width: 24px; height: 24px; background: #e0e7ff; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700; color: #4f46e5;">${i + 1}</div>
      </td>
      <td style="padding: 8px 0; color: #374151; font-size: 14px; line-height: 1.5;">${step}</td>
    </tr>
  `).join('');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background: #f9fafb;">
      <div style="background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e3a5f, #2563eb); padding: 32px 24px; text-align: center; color: white;">
          <p style="font-size: 14px; opacity: 0.85; margin: 0 0 4px;">🏠 Your Home Buying Strategy</p>
          <h1 style="margin: 0; font-size: 24px;">Hi ${s.buyerName}!</h1>
          <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.85;">${s.profileDescription}</p>
        </div>

        <div style="padding: 24px;">
          <!-- Key Details -->
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr>
              <td style="padding: 12px; background: #f0f9ff; border-radius: 8px; width: 50%;">
                <p style="margin: 0; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Timeline</p>
                <p style="margin: 4px 0 0; font-size: 16px; font-weight: 600; color: #1f2937;">📅 ${s.timeline}</p>
                ${s.timelineNote ? `<p style="margin: 2px 0 0; font-size: 12px; color: #6b7280;">${s.timelineNote}</p>` : ''}
              </td>
              <td style="width: 12px;"></td>
              <td style="padding: 12px; background: #f0fdf4; border-radius: 8px; width: 50%;">
                <p style="margin: 0; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Price Range</p>
                <p style="margin: 4px 0 0; font-size: 16px; font-weight: 600; color: #1f2937;">💰 ${s.priceDescription}</p>
              </td>
            </tr>
          </table>

          <!-- Property Preferences -->
          <div style="background: #faf5ff; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <p style="margin: 0; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Property Preferences</p>
            <p style="margin: 4px 0 0; font-size: 16px; font-weight: 600; color: #1f2937;">🏡 ${s.propertyLine}</p>
            <p style="margin: 2px 0 0; font-size: 13px; color: #6b7280;">📍 ${s.targetArea}</p>
            ${s.preferencesNote ? `<p style="margin: 6px 0 0; font-size: 13px; color: #6b7280;">${s.preferencesNote}</p>` : ''}
          </div>

          <!-- Next Steps -->
          <div style="margin-bottom: 24px;">
            <h3 style="margin: 0 0 12px; font-size: 14px; color: #1f2937; text-transform: uppercase; letter-spacing: 0.05em;">🎯 Your Next Steps</h3>
            <table style="width: 100%; border-collapse: collapse;">
              ${nextStepsHtml}
            </table>
          </div>

          <!-- Realtor Message -->
          <div style="background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 16px; margin-bottom: 24px;">
            <p style="margin: 0; font-size: 12px; color: #92400e; font-weight: 600;">A Message from ${data.realtorName}</p>
            <p style="margin: 8px 0 0; font-size: 14px; color: #78350f; line-height: 1.5; font-style: italic;">"${s.realtorMessage}"</p>
          </div>

          <!-- Realtor Info -->
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="margin: 0; font-weight: 600; color: #1f2937;">${data.realtorName}</p>
            ${data.realtorCompany ? `<p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">${data.realtorCompany}</p>` : ''}
            <p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">${data.realtorEmail}</p>
            ${data.realtorPhone ? `<p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">${data.realtorPhone}</p>` : ''}
          </div>
        </div>
      </div>

      <p style="text-align: center; font-size: 11px; color: #9ca3af; margin-top: 24px;">
        This email was sent automatically after completing your buyer qualification interview.
      </p>
    </div>
  `;

  await transport.sendMail({
    from: process.env.SMTP_USER,
    to: data.buyerEmail,
    subject: `🏠 Your Home Buying Strategy - ${s.buyerName}`,
    html,
  });

  console.log('[Email] Completion email sent to:', data.buyerEmail);
}
