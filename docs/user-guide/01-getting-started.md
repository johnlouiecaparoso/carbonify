# Getting Started with Carbonify

*Your first steps on Carbonify — creating an account, signing in securely, verifying your identity, and finding your way around. This guide is for **every** user, whatever your role.*

Related: [User Guide index](README.md) · [Buyer Guide](02-buyer-guide.md)

---

## 1. Create an account

1. Go to **`/register`** (or click **Sign Up** in the top-right of the header).
2. Fill in the **Create your account** form:
   - **Full name**
   - **Email Address**
   - **Password** — must be at least **8 characters**
   - **Confirm password** — must match
3. Click **Create Account**.
4. On success you are taken to the **login page**. New accounts start with the **General User** role.

**Prefer Google?** Click **Sign up with Google** to register with your Google account instead of a password.

**Applying as a specialist?** The sign-up page also links to:
- **Apply as a Project Developer** and **Apply as a Verifier** (these go to the application form at `/apply` — see [Section 8](#8-apply-for-a-different-role)).
- **Register as an LGU** for local government units, which has its own registration page.

## 2. Confirm your email

After registering, Carbonify sends a confirmation link to your email address. Open your inbox (check spam too) and click the link to confirm.

If your email is not confirmed yet, signing in shows:

> *"Your email address has not been confirmed yet. Please check your inbox for the confirmation link, or ask an admin to verify your account."*

You can see your email status any time under **Profile → Account → Account Status** (it shows **VERIFIED** or **PENDING**).

## 3. Log in

1. Go to **`/login`** (or click **Login** in the header).
2. Enter your **Email Address** and **Password**, then click **Sign In**.
3. After signing in you land on the **Home** page (`/home`). If you were sent to login from a specific page, you are returned there instead.

Two other sign-in methods are available below the divider:
- **Continue with Google** — sign in with your Google account.
- **Sign in with phone** — enter your number in international format (e.g. `+639171234567`), tap **Send code**, then enter the 6-digit SMS code and tap **Verify & sign in**.

> If you have 2FA enabled, you'll be asked for an authenticator code right after your password — see [Section 5](#5-what-happens-at-2fa-step-up).

## 4. Reset a forgotten password

1. On the login page, click **Forgot your password?** (or go to **`/forgot-password`**).
2. Enter your email address and click **Send reset link**.
3. For privacy, Carbonify always shows a confirmation ("If an account exists… a password reset link is on its way"). Check your inbox and spam folder.
4. Open the emailed link — it takes you to the **reset password** page (`/reset-password`) where you set a new password.

You can also change your password while signed in from **Profile → Security**.

## 5. Set up two-factor authentication (2FA)

2FA adds a time-based one-time code (TOTP) from an authenticator app as a second sign-in factor.

**Where:** **Profile → Security** tab (`/profile`), under **Two-Factor Authentication**.

1. Open **Profile**, then click the **Security** tab.
2. Under **Two-Factor Authentication**, click **Enable 2FA**.
3. **Scan the QR code** shown with your authenticator app (Google Authenticator, Authy, etc.). If you can't scan, use the **manual key** displayed below the QR.
4. Enter the **6-digit code** from your app and click **Verify & Enable**.
5. A green **Enabled** badge appears. Your account is now protected by 2FA.

**To turn it off:** return to **Profile → Security** and click **Disable 2FA** (you'll be asked to confirm).

### What happens at 2FA step-up

Carbonify enforces 2FA strictly. If you have 2FA enrolled, then **any time your session isn't yet stepped-up**, you are redirected to the **Two-Factor Authentication challenge** page (`/mfa-challenge`) before you can reach protected pages.

On that page:
1. Enter the **6-digit code** from your authenticator app.
2. Click **Verify** to continue to where you were headed.
3. If you can't complete it, click **Sign out**.

## 6. Complete identity verification (KYC)

**Prerequisites:** a signed-in account. **You must reach KYC Level 1 (Basic) before you can buy or trade credits.**

**Where:** **`/kyc`** (also in the profile dropdown under **Account → KYC Verification**).

1. Go to **`/kyc`**. A status banner at the top shows your current state: **Not verified**, **Verification pending**, **Verified**, or **Verification rejected**.
2. If you can submit, fill in the **Submit verification** form:
   - **Full legal name** (as shown on your ID) — required
   - **Organization** (optional)
   - **ID document type** — choose from: Philippine National ID (PhilSys), Passport, Driver's License, Voter's ID, UMID, Postal ID, or Business Registration (SEC/DTI) — required
   - **Upload ID document** (optional) — JPEG/PNG/PDF up to 2 MB
3. Click **Submit for Verification**.
4. An administrator reviews your application. The banner switches to **Verification pending**, and you'll be notified when it's approved. Your submissions are listed under **Your applications** with their status.

**KYC levels:**

| Level | Label | What it means |
|-------|-------|---------------|
| 0 | Unverified | Not yet verified. |
| 1 | Basic | Minimum level required to buy and trade credits. |
| 2 | Verified | Enhanced verification; earns the verified badge on your profile. |
| 3 | Enhanced | Admin-only override, not part of the normal flow. |

## 7. Fill in your profile and organization info

**Where:** **`/profile`** → **Account** tab (or **Profile Settings** in the header dropdown).

1. Click **Edit Profile**.
2. Update your **Personal Information**: Full Name, Email, Company, Location, Phone, Website.
3. Add **organization details** if relevant: Organization Name, Organization Type (e.g. Municipal LGU, City Government, Cooperative, NGO / Civil Society, Private Company, and more), and Organization Address.
4. Click **Save Changes** (or **Cancel** to discard).

Other things you can do on the profile page:
- **Upload a profile photo** (**Upload Photo** / **Change Photo** / **Remove**) in the left card.
- **Notifications** tab — toggle Email Notifications, Project Updates, Market Alerts, and the Newsletter.
- **Security** tab — change your password and manage 2FA.
- **Privacy & Data** tab — download a copy of your data or request account deletion.
- **Role & Access** section (Account tab) — shows your current role, a short description, and quick links. General Users see an **"Apply for an advanced role"** hint here.

## 8. Apply for a different role

**Where:** **`/apply`** (linked from the sign-up page, the profile Role & Access section, and the "Upgrade/Apply" hints).

Carbonify lets you apply to become a specialist. The admin team reviews every request.

1. Go to **`/apply`**.
2. Under **Choose your role focus**, pick **Project Developer** or **Verifier**.
3. Fill in the application form. The fields depend on the role:
   - **Project Developer** asks for company name, business registration number, country, business address, contact person, legal documents (Certificate of Registration, Articles/Business Permit, TIN, proof of legal existence), company background, years of operation, past/ongoing projects, and portfolio.
   - **Verifier** asks for your organization/firm, accreditation body and number, years of experience, specializations, past projects, contact phone, and supporting links or file attachments.
   - If you're not signed in yet, the form also asks you to set an account password so it can match your request later.
4. Click **Submit application**. You'll see an **"Application received"** confirmation, and the admin team follows up by email.

> **LGU users** don't use `/apply`. There's a dedicated **"Register as an LGU"** link on the sign-up page.

## 9. Plans and upgrading

**Where:** **`/upgrade`** (in the profile dropdown under **More → Upgrade plan**).

Plans are separate from roles — a plan is about what features you're paying for, not what kind of user you are.

| Plan | Price | Highlights |
|------|-------|------------|
| Free | ₱0/mo | Browse & buy carbon credits, up to 3 active listings, basic buying analytics. |
| Pro | ₱499/mo | Advanced selling analytics & revenue charts, unlimited active marketplace listings. |
| Business | ₱1,499/mo | Everything in Pro, plus priority support. |

To upgrade:
1. Go to **`/upgrade`**. Your current plan is shown at the top.
2. Click **Choose Pro** or **Choose Business**.
3. You're redirected to **PayMongo** checkout (GCash, Maya, or card). Sandbox test card: **4343 4343 4343 4345**.
4. After payment, return to the page — it confirms your upgrade (this can take a few seconds while the payment is verified).

Each payment grants **30 days** of access. There's no auto-renew — simply check out again to extend.

## 10. Getting around (navigation overview)

The header appears on every page.

- **Logo** (top-left on desktop, top-right on mobile) — returns you Home.
- **Top navigation:** **Home**, **Marketplace**, **Market** (public market dashboard), **Registry** (public carbon registry). Signed-out visitors also see **About** here.
- **When signed in,** buyers and general users also get **Project Map**, **Portfolio**, **Retire Credits**, and **Carbon Calculator** in the top nav. (Specialist roles see their own workspace links instead — e.g. Admin Dashboard, Verifier Panel, Submit Project, LGU Tools.)
- **Notifications bell** — shows unread alerts; open it to read them or **Mark all read**.
- **Profile menu** (your avatar, top-right) — opens a dropdown with **Profile Settings** plus grouped links: your workspace, **Account** (KYC, Wallet), **Shopping** (Cart, Saved), **Credits** (Portfolio, Retire Credits), **Records** (Receipts, Certificates), **More** (Upgrade plan, About), and **Logout**.
- **Mobile:** tap the **hamburger menu** (top-left) for the same navigation and account links.

## 11. The seven roles

Carbonify has seven roles. Everyone starts as a **General User**.

| Role (display name) | What it does |
|---------------------|--------------|
| General User | Basic access to view the marketplace and manage your profile. |
| Buyer/Investor | Purchase and manage carbon credits. |
| Project Developer | Create and manage carbon-credit projects. |
| Verifier | Review and approve/reject carbon-credit projects. |
| LGU User | Upload LGU emissions and manage community projects. |
| Farmer | Supply biomass feedstock, log deliveries, and track estimated carbon participation. |
| Administrator | Full system access to manage every aspect of the platform. |

**Project Developer, Verifier and Farmer** are specialist roles — you apply from your profile, and
the role stays restricted until an administrator approves your application.

Next: head to the guide for your role — most new users want the **[Buyer Guide](02-buyer-guide.md)**.
