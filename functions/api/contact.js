// Cloudflare Pages / Worker Function: POST /api/contact
// Validates contact form submissions, verifies Cloudflare Turnstile server-side when
// TURNSTILE_SECRET_KEY is configured, and dispatches via Cloudflare send_email binding
// or Resend API when configured; otherwise instructs the browser relay to handle delivery.

const JSON_HEADERS = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
};

const DEFAULT_TO_EMAIL = 'info@baluchmartyrs.com';
const DEFAULT_FROM_EMAIL = 'Baluch Martyrs Memorial <noreply@baluchmartyrs.com>';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function stripHeaderBreaks(value, maxLen) {
    return String(value ?? '')
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .slice(0, maxLen);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function verifyTurnstileServer(token, secretKey, remoteIp) {
    if (!secretKey) {
        return { ok: true, mode: 'unconfigured' };
    }
    if (!token || token.length < 10) {
        return { ok: false, status: 400, error: 'Please complete the "Verify you are human" check before sending.' };
    }

    try {
        const formData = new URLSearchParams();
        formData.set('secret', secretKey);
        formData.set('response', token);
        if (remoteIp) formData.set('remoteip', remoteIp);

        const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData.toString()
        });
        if (!verifyRes.ok) {
            return { ok: true, mode: 'turnstile-http-fallback' };
        }
        const outcome = await verifyRes.json();
        if (!outcome || !outcome.success) {
            return { ok: false, status: 403, error: 'Human verification expired or failed. Please check the box again.' };
        }
        return { ok: true, mode: 'verified' };
    } catch {
        return { ok: true, mode: 'turnstile-network-fallback' };
    }
}

function buildEmailHtml(entry) {
    const safeMsg = escapeHtml(entry.message).replace(/\r?\n/g, '<br>');
    return [
        '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">',
        '<h2 style="margin:0 0 12px;color:#14532d;">New Archive Inquiry</h2>',
        `<p><strong>Name:</strong> ${escapeHtml(entry.name)}</p>`,
        `<p><strong>Email:</strong> <a href="mailto:${escapeHtml(entry.email)}">${escapeHtml(entry.email)}</a></p>`,
        `<p><strong>Category:</strong> ${escapeHtml(entry.type)}</p>`,
        `<p><strong>Subject:</strong> ${escapeHtml(entry.subject)}</p>`,
        '<hr style="border:none;border-top:1px solid #cbd5e1;margin:16px 0;">',
        `<div style="white-space:normal;line-height:1.6;">${safeMsg}</div>`,
        '</div>'
    ].join('');
}

function buildEmailText(entry) {
    return [
        `New Archive Inquiry (${entry.type})`,
        `Name: ${entry.name}`,
        `Email: ${entry.email}`,
        `Subject: ${entry.subject}`,
        '',
        'Message:',
        entry.message
    ].join('\n');
}

async function sendViaResend(entry, env) {
    const apiKey = env && env.RESEND_API_KEY ? String(env.RESEND_API_KEY).trim() : '';
    if (!apiKey) return { attempted: false, delivered: false };

    const toEmail = (env.CONTACT_TO_EMAIL && String(env.CONTACT_TO_EMAIL).trim()) || DEFAULT_TO_EMAIL;
    const fromEmail = (env.CONTACT_FROM_EMAIL && String(env.CONTACT_FROM_EMAIL).trim()) || DEFAULT_FROM_EMAIL;

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: fromEmail,
                to: [toEmail],
                reply_to: entry.email,
                subject: `[Baluch Martyrs Memorial - ${entry.type.toUpperCase()}] ${entry.subject}`,
                text: buildEmailText(entry),
                html: buildEmailHtml(entry)
            })
        });
        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.error('Resend contact send failed:', res.status, errText);
            return { attempted: true, delivered: false };
        }
        return { attempted: true, delivered: true, provider: 'resend' };
    } catch (err) {
        console.error('Resend contact fetch error:', err?.message || err);
        return { attempted: true, delivered: false };
    }
}

async function sendViaCloudflareBinding(entry, env) {
    const binding = env && (env.SEND_EMAIL || env.CONTACT_EMAIL);
    if (!binding || typeof binding.send !== 'function') {
        return { attempted: false, delivered: false };
    }

    const toEmail = (env.CONTACT_TO_EMAIL && String(env.CONTACT_TO_EMAIL).trim()) || DEFAULT_TO_EMAIL;
    const rawFrom = (env.CONTACT_FROM_EMAIL && String(env.CONTACT_FROM_EMAIL).trim()) || 'noreply@baluchmartyrs.com';
    const fromEmailMatch = rawFrom.match(/<([^>]+)>/);
    const fromEmail = fromEmailMatch ? fromEmailMatch[1].trim() : rawFrom;

    try {
        await binding.send({
            to: toEmail,
            from: { email: fromEmail, name: 'Baluch Martyrs Memorial' },
            replyTo: { email: entry.email, name: entry.name },
            subject: `[Baluch Martyrs Memorial - ${entry.type.toUpperCase()}] ${entry.subject}`,
            text: buildEmailText(entry),
            html: buildEmailHtml(entry)
        });
        return { attempted: true, delivered: true, provider: 'cloudflare-send-email' };
    } catch (err) {
        console.error('Cloudflare send_email failed:', err?.message || err);
        return { attempted: true, delivered: false };
    }
}

export async function onRequest({ request, env }) {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: JSON_HEADERS });
    }
    if (request.method !== 'POST') {
        return json({ success: false, error: 'Method not allowed' }, 405);
    }

    let payload;
    try {
        payload = await request.json();
    } catch {
        return json({ success: false, error: 'Invalid request payload.' }, 400);
    }

    const name = stripHeaderBreaks(payload?.name, 120);
    const email = stripHeaderBreaks(payload?.email, 160);
    const subject = stripHeaderBreaks(payload?.subject, 200);
    const type = stripHeaderBreaks(payload?.type || 'general', 40) || 'general';
    const message = String(payload?.message ?? '').trim().slice(0, 5000);
    const turnstileToken = String(payload?.turnstileToken ?? '').trim();

    if (!name || !email || !subject || !message) {
        return json({ success: false, error: 'Please complete all required fields.' }, 400);
    }
    if (!EMAIL_RE.test(email)) {
        return json({ success: false, error: 'Please provide a valid email address.' }, 400);
    }

    const secretKey = env && env.TURNSTILE_SECRET_KEY ? String(env.TURNSTILE_SECRET_KEY).trim() : '';
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const captchaCheck = await verifyTurnstileServer(turnstileToken, secretKey, ip);
    if (!captchaCheck.ok) {
        return json({ success: false, error: captchaCheck.error }, captchaCheck.status || 403);
    }

    const entry = { name, email, subject, type, message };

    const cfRes = await sendViaCloudflareBinding(entry, env);
    if (cfRes.delivered) {
        return json({ success: true, verified: true, delivered: true, provider: cfRes.provider });
    }

    const resendRes = await sendViaResend(entry, env);
    if (resendRes.delivered) {
        return json({ success: true, verified: true, delivered: true, provider: resendRes.provider });
    }

    return json({
        success: true,
        verified: true,
        delivered: false,
        relay: 'formsubmit'
    });
}
