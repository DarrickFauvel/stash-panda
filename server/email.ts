import nodemailer from 'nodemailer'

const APP_URL = process.env.APP_URL || 'http://localhost:3000'
const FROM = process.env.EMAIL_FROM || 'Pocket Universe <noreply@pocketuniverse.app>'

function transport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

async function send(options: nodemailer.SendMailOptions) {
  if (!isConfigured()) {
    console.log('[email] SMTP not configured — skipping send to', options.to)
    return
  }
  try {
    const info = await transport().sendMail({ from: FROM, ...options })
    if (process.env.NODE_ENV !== 'production') {
      console.log('[email] sent:', nodemailer.getTestMessageUrl(info) || info.messageId)
    }
  } catch (err) {
    console.error('[email] send failed:', err)
  }
}

export async function sendVerificationEmail(to: string, name: string, token: string) {
  const link = `${APP_URL}/verify-email?token=${token}`
  await send({
    to,
    subject: 'Verify your Pocket Universe email',
    text: `Hi ${name},\n\nThanks for joining Pocket Universe! Please verify your email address:\n\n${link}\n\nThis link expires in 24 hours. If you didn't create an account, you can safely ignore this.\n\n— Pocket Universe`,
    html: `
      <p>Hi ${name},</p>
      <p>Thanks for joining Pocket Universe! Please verify your email address:</p>
      <p><a href="${link}" style="background:#2d6a4f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Verify Email</a></p>
      <p>Or copy this link: ${link}</p>
      <p>This link expires in 24 hours. If you didn't create an account, you can safely ignore this.</p>
      <p>— Pocket Universe</p>
    `,
  })
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${APP_URL}/reset-password?token=${token}`
  await send({
    to,
    subject: 'Reset your Pocket Universe password',
    text: `Someone requested a password reset for your Pocket Universe account.\n\nReset your password here:\n\n${link}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore it.\n\n— Pocket Universe`,
    html: `
      <p>Someone requested a password reset for your Pocket Universe account.</p>
      <p><a href="${link}" style="background:#2d6a4f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Reset Password</a></p>
      <p>Or copy this link: ${link}</p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore it.</p>
      <p>— Pocket Universe</p>
    `,
  })
}

export async function sendInviteEmail(
  to: string,
  inviterName: string,
  galaxyName: string,
  role: string,
  token: string,
) {
  const link = `${APP_URL}/invite/${token}`
  await send({
    to,
    subject: `${inviterName} invited you to "${galaxyName}" on Pocket Universe`,
    text: `${inviterName} has invited you to join "${galaxyName}" as a${role === 'editor' ? 'n' : ''} ${role}.\n\nAccept the invite here:\n\n${link}\n\nThis invite expires in 7 days.\n\n— Pocket Universe`,
    html: `
      <p>${inviterName} has invited you to join <strong>${galaxyName}</strong> as a${role === 'editor' ? 'n' : ''} <strong>${role}</strong>.</p>
      <p><a href="${link}" style="background:#2d6a4f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Accept Invite</a></p>
      <p>Or copy this link: ${link}</p>
      <p>This invite expires in 7 days.</p>
      <p>— Pocket Universe</p>
    `,
  })
}
