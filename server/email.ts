import nodemailer from 'nodemailer'

const APP_URL = process.env.APP_URL || 'http://localhost:3000'
const FROM = process.env.EMAIL_FROM || 'Stash Panda <noreply@stashpanda.app>'

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
    subject: 'Verify your Stash Panda email',
    text: `Hi ${name},\n\nThanks for joining Stash Panda! Please verify your email address:\n\n${link}\n\nThis link expires in 24 hours. If you didn't create an account, you can safely ignore this.\n\n— Stash Panda`,
    html: `
      <p>Hi ${name},</p>
      <p>Thanks for joining Stash Panda! Please verify your email address:</p>
      <p><a href="${link}" style="background:#2d6a4f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Verify Email</a></p>
      <p>Or copy this link: ${link}</p>
      <p>This link expires in 24 hours. If you didn't create an account, you can safely ignore this.</p>
      <p>— Stash Panda</p>
    `,
  })
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${APP_URL}/reset-password?token=${token}`
  await send({
    to,
    subject: 'Reset your Stash Panda password',
    text: `Someone requested a password reset for your Stash Panda account.\n\nReset your password here:\n\n${link}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore it.\n\n— Stash Panda`,
    html: `
      <p>Someone requested a password reset for your Stash Panda account.</p>
      <p><a href="${link}" style="background:#2d6a4f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Reset Password</a></p>
      <p>Or copy this link: ${link}</p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore it.</p>
      <p>— Stash Panda</p>
    `,
  })
}

export async function sendInviteEmail(
  to: string,
  inviterName: string,
  inventoryName: string,
  role: string,
  token: string,
) {
  const link = `${APP_URL}/invite/${token}`
  await send({
    to,
    subject: `${inviterName} invited you to "${inventoryName}" on Stash Panda`,
    text: `${inviterName} has invited you to join "${inventoryName}" as a${role === 'editor' ? 'n' : ''} ${role}.\n\nAccept the invite here:\n\n${link}\n\nThis invite expires in 7 days.\n\n— Stash Panda`,
    html: `
      <p>${inviterName} has invited you to join <strong>${inventoryName}</strong> as a${role === 'editor' ? 'n' : ''} <strong>${role}</strong>.</p>
      <p><a href="${link}" style="background:#2d6a4f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Accept Invite</a></p>
      <p>Or copy this link: ${link}</p>
      <p>This invite expires in 7 days.</p>
      <p>— Stash Panda</p>
    `,
  })
}
