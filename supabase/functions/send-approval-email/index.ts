import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Escape untrusted applicant-supplied text before interpolating into HTML email. */
function escapeHtml(value?: string): string {
  if (!value) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// H4: this function is a fixed-purpose notifier, NOT a general mailer. It accepts
// a message TYPE plus the id of a row, and derives every recipient, subject and
// body from that row server-side. It has never again accepted caller-supplied
// `to`/`subject`/`html` — with the project's public anon key and open signup that
// let anyone send arbitrary HTML from Carbonify's own verified sender: a
// brand-credible phishing/spam relay.
//
// 2026-08-06 — three message types, not one. The H4 rewrite supported only the
// submission notice, but three callers in emailService.js were still posting the
// pre-H4 `{to, subject, html}` shape and had been getting 400 ever since:
// approval mail, rejection mail, and the verifier's new-project notice. Approval
// was the one that showed up in the console (approving a project_developer);
// the other two failed exactly the same way with nobody watching. Adding the
// missing types is the fix — widening the contract back to `to`/`html` is not.
type MessageType =
  | 'role_application_submitted'
  | 'role_application_decision'
  | 'project_submitted'

type EmailPayload = {
  type?: MessageType
  // role_application_submitted
  role_requested?: string
  applicant_full_name?: string
  applicant_email?: string
  // role_application_decision
  application_id?: string
  // project_submitted
  project_id?: string
}

const ROLE_LABELS: Record<string, string> = {
  project_developer: 'Project Developer',
  verifier: 'Verifier',
  farmer: 'Farmer',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!resendApiKey) {
      return json({ error: 'Missing RESEND_API_KEY secret' }, 500)
    }
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret' }, 500)
    }

    const payload = (await req.json()) as EmailPayload

    // Back-compat: the submission notice used to be the only supported request
    // and carried no `type`. Keep inferring it so an older cached bundle keeps
    // working through a deploy.
    const messageType: MessageType =
      payload.type ?? (payload.role_requested ? 'role_application_submitted' : ('' as MessageType))

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    // The caller's own JWT, for the requests that need to know WHO is asking.
    // Note this is only meaningful for a real user token — the anon key is also
    // a valid JWT and getUser() rejects it, which is the point.
    async function requireReviewer(): Promise<{ id: string; role: string } | Response> {
      const authHeader = req.headers.get('Authorization') || ''
      const token = authHeader.replace(/^Bearer\s+/i, '').trim()
      if (!token) return json({ error: 'Missing Authorization header' }, 401)

      const { data: userData, error: userError } = await supabase.auth.getUser(token)
      if (userError || !userData?.user) {
        return json({ error: 'A signed-in reviewer is required for this request' }, 401)
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', userData.user.id)
        .single()

      if (profileError || !profile) {
        return json({ error: 'Could not resolve the caller profile' }, 403)
      }
      if (profile.role !== 'verifier' && profile.role !== 'admin') {
        return json({ error: 'Only a verifier or admin may trigger this message' }, 403)
      }
      return { id: profile.id, role: profile.role }
    }

    let to: string[] = []
    let subject = ''
    let html = ''

    if (messageType === 'role_application_submitted') {
      // Unchanged since H4. Recipients are the reviewers for the requested role.
      if (
        payload.role_requested !== 'project_developer' &&
        payload.role_requested !== 'verifier'
      ) {
        return json(
          { error: 'Unsupported request: role_requested must be project_developer or verifier' },
          400,
        )
      }

      const targetRoles =
        payload.role_requested === 'project_developer' ? ['verifier', 'admin'] : ['admin']
      const roleLabel = ROLE_LABELS[payload.role_requested]
      const reviewDestination =
        payload.role_requested === 'project_developer'
          ? 'the verifier panel'
          : 'the admin role applications panel'

      const { data: recipients, error: recipientsError } = await supabase
        .from('profiles')
        .select('email')
        .in('role', targetRoles)
        .not('email', 'is', null)

      if (recipientsError) {
        return json(
          { error: 'Failed to load reviewer recipients', details: recipientsError.message },
          500,
        )
      }

      to = (recipients || []).map((r) => r.email).filter(Boolean)
      subject = `New ${roleLabel} Application`
      html = `
      <p>A new role application has been submitted.</p>
      <p><strong>Applicant:</strong> ${escapeHtml(payload.applicant_full_name) || 'N/A'}</p>
      <p><strong>Email:</strong> ${escapeHtml(payload.applicant_email) || 'N/A'}</p>
      <p><strong>Requested role:</strong> ${roleLabel}</p>
      <p>Please review this request in ${reviewDestination}.</p>
    `
    } else if (messageType === 'role_application_decision') {
      // The caller supplies an application id and NOTHING else. The recipient,
      // the decision, the applicant's name and the reviewer's notes all come off
      // the stored row — so a caller cannot address this mail at a third party,
      // and cannot claim an outcome the database does not already record.
      const reviewer = await requireReviewer()
      if (reviewer instanceof Response) return reviewer

      if (!payload.application_id) {
        return json({ error: 'application_id is required for role_application_decision' }, 400)
      }

      const { data: application, error: applicationError } = await supabase
        .from('role_applications')
        .select('id, email, applicant_full_name, role_requested, status, user_id, admin_notes, decision_reason, reviewed_at')
        .eq('id', payload.application_id)
        .single()

      if (applicationError || !application) {
        return json({ error: 'Application not found' }, 404)
      }
      if (application.status !== 'approved' && application.status !== 'rejected') {
        return json(
          { error: `No decision to send: application status is "${application.status}"` },
          409,
        )
      }

      // Same fallback the client used to apply (roleApplicationService
      // .resolveApplicationEmail): an application submitted from a signed-in
      // account may carry no email of its own.
      let applicantEmail = (application.email || '').trim().toLowerCase()
      if (!applicantEmail && application.user_id) {
        const { data: applicantProfile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', application.user_id)
          .single()
        applicantEmail = (applicantProfile?.email || '').trim().toLowerCase()
      }
      if (!applicantEmail) {
        return json({ success: true, message: 'Application has no email address', sent: 0 }, 200)
      }

      const approved = application.status === 'approved'
      const roleLabel = ROLE_LABELS[application.role_requested] || 'Specialist'
      const appBase = (Deno.env.get('APP_BASE_URL') || 'https://carbonify-gilt.vercel.app').replace(
        /\/$/,
        '',
      )
      const applicantName = escapeHtml(application.applicant_full_name) || 'Carbonify Specialist'
      const decidedAt = application.reviewed_at
        ? new Date(application.reviewed_at).toUTCString()
        : new Date().toUTCString()

      to = [applicantEmail]

      if (approved) {
        // An applicant with no linked account cannot sign in yet — send them to
        // registration instead, prefilled from the row rather than from the caller.
        const nextStep = application.user_id
          ? `<p>You can now sign in and access your dashboard here:<br/><a href="${appBase}/login">${appBase}/login</a></p>`
          : `<p>To get started, create your Carbonify account using this link:<br/><a href="${appBase}/register?role=${encodeURIComponent(application.role_requested || '')}&amp;email=${encodeURIComponent(applicantEmail)}">${appBase}/register</a></p>`

        subject = `Your ${roleLabel} account has been verified`
        html = `
      <p>Hi ${applicantName},</p>
      <p>Your Carbonify account for the <strong>${roleLabel}</strong> role has been verified and approved.</p>
      ${nextStep}
      <p>Verification date: ${decidedAt}</p>
      <p>If you believe this was sent in error, please contact the Carbonify support team.</p>
      <p>— The Carbonify Team</p>
    `
      } else {
        const notes = escapeHtml(
          (application.decision_reason || application.admin_notes || '').trim(),
        )
        subject = `Update on your ${roleLabel} application`
        html = `
      <p>Hi ${applicantName},</p>
      <p>Thank you for applying for the <strong>${roleLabel}</strong> role on Carbonify.</p>
      <p>After review, your application was <strong>not approved</strong> at this time.</p>
      ${notes ? `<p><strong>Reviewer notes:</strong><br/>${notes}</p>` : ''}
      <p>You may submit a stronger application after updating your details and supporting information:</p>
      <p><a href="${appBase}/apply?role=${encodeURIComponent(application.role_requested || '')}">${appBase}/apply</a></p>
      <p>Decision date: ${decidedAt}</p>
      <p>If you need clarification, please contact the Carbonify support team.</p>
      <p>— The Carbonify Team</p>
    `
      }
    } else if (messageType === 'project_submitted') {
      // Reviewers only. The project row supplies the details; the caller supplies
      // an id. Any signed-in user may submit a project, so this one does not
      // require a reviewer — but it can only ever mail reviewers.
      if (!payload.project_id) {
        return json({ error: 'project_id is required for project_submitted' }, 400)
      }

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('id, title, category, location, user_id')
        .eq('id', payload.project_id)
        .single()

      if (projectError || !project) {
        return json({ error: 'Project not found' }, 404)
      }

      const { data: submitter } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', project.user_id)
        .single()

      const { data: recipients, error: recipientsError } = await supabase
        .from('profiles')
        .select('email')
        .in('role', ['verifier', 'admin'])
        .not('email', 'is', null)

      if (recipientsError) {
        return json(
          { error: 'Failed to load reviewer recipients', details: recipientsError.message },
          500,
        )
      }

      to = (recipients || []).map((r) => r.email).filter(Boolean)
      subject = 'New Project Submitted for Review'
      html = `
      <p>A new project has been submitted and needs verifier review.</p>
      <p><strong>Project:</strong> ${escapeHtml(project.title) || 'N/A'}</p>
      <p><strong>Category:</strong> ${escapeHtml(project.category) || 'N/A'}</p>
      <p><strong>Location:</strong> ${escapeHtml(project.location) || 'N/A'}</p>
      <p><strong>Submitted by:</strong> ${escapeHtml(submitter?.full_name || submitter?.email) || 'N/A'}</p>
      <p>Please review this project in the verifier panel.</p>
    `
    } else {
      return json(
        {
          error:
            'Unsupported request: type must be role_application_submitted, role_application_decision or project_submitted',
        },
        400,
      )
    }

    if (!to.length) {
      // Nobody to notify — not an error the caller can fix.
      return json({ success: true, message: 'No recipients configured', sent: 0 }, 200)
    }

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // A2: never trust a caller-supplied `from`. The sender is fixed to our
        // own address (overridable only via a server-side secret) so this
        // function can't be used to spoof mail from an arbitrary domain.
        from: Deno.env.get('APPROVAL_EMAIL_FROM') || 'Carbonify <notifications@resend.dev>',
        to,
        subject,
        html,
      }),
    })

    const responseText = await resendResponse.text()
    if (!resendResponse.ok) {
      return json({ error: 'Failed to send email', details: responseText }, resendResponse.status)
    }

    return new Response(responseText, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : 'Unexpected function error' },
      500,
    )
  }
})
