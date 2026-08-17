import { createFileRoute } from "@tanstack/react-router";
import { LegalDocument, LegalSection } from "@/components/site/LegalDocument";
import { CONTACT_EMAIL, SUPPORTED_PLATFORM_NAMES } from "@/content/extension";
import { pageSeo } from "@/content/site";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    ...pageSeo({
      path: "/privacy",
      title: "Privacy Policy — OfferLyst",
      description: "How OfferLyst handles your account, resume, and job search data.",
    }),
  }),
  component: PrivacyPage,
});

const LAST_UPDATED = "August 20, 2026";

function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      lastUpdated={LAST_UPDATED}
      intro={
        <>
          This policy describes what data OfferLyst collects, why, and how it's used. It is
          written to match what the product actually does, not a generic template — if something
          here stops being true as the product changes, this page is expected to change with it.
        </>
      }
    >
      <LegalSection title="Account data">
        <p>
          Creating an account requires an email address and password, or signing in with Google.
          We store your name, email, and any location or target-role information you add in
          Settings. This data is scoped to your account: our database enforces that only you can
          read or write it, and it's never shared with other users.
        </p>
      </LegalSection>

      <LegalSection title="Resumes and documents">
        <p>
          Resume files you upload are stored in our file storage and parsed to extract their text
          content. Parsing itself happens on our servers and does not involve a third-party AI
          service — it only runs when you take an AI action (see below), not at upload time.
        </p>
        <p>
          If you upload an avatar image, note that avatar images are stored in a location that is
          publicly readable by anyone who has the exact file URL (the URL itself is not
          discoverable or listed anywhere) — unlike your resumes, applications and account data,
          which are private to your account.
        </p>
      </LegalSection>

      <LegalSection title="AI features and third-party processing">
        <p>
          AI features (resume match, ATS compatibility check, resume optimization, cover letter
          drafting, interview preparation, and mock interviews) are powered by OpenAI. When you
          trigger one of these actions, the relevant data — your resume text, the job posting's
          details (role, company, description, requirements), and your target role/location if
          set — is sent to OpenAI to generate the result. This only happens when you actively use
          an AI feature; browsing, saving jobs, and tracking applications never sends anything to
          OpenAI.
        </p>
        <p>
          Reviewing your Gmail inbox (see below) uses a narrower, separate process: only
          structured facts about an email — the sender's domain and name, the subject line, and
          Gmail's own short preview snippet — are sent for classification, never the full email
          body or other emails.
        </p>
        <p>
          We do not control how OpenAI itself retains or uses submitted data beyond what it sends
          back to us; refer to OpenAI's own privacy and data-usage terms for details on their
          side.
        </p>
      </LegalSection>

      <LegalSection title="Browser extension">
        <p>
          The OfferLyst Chrome extension reads job posting content (title, company, description,
          and similar public details) on supported job sites ({SUPPORTED_PLATFORM_NAMES.join(", ")})
          to let you save or track a role in one click. It does not read anything on pages other
          than the job posting content itself, and it does not request access to your browsing
          history or cookies on other sites.
        </p>
        <p>
          To know you're signed in, the extension reads your OfferLyst session token from this
          site's own local browser storage — the same mechanism the website itself uses to keep
          you signed in — only when you're on the OfferLyst site. It does not have a separate
          login and never sees your password.
        </p>
      </LegalSection>

      <LegalSection title="Google Gmail and Calendar integration">
        <p>
          Connecting Gmail and Calendar review is entirely optional and separate from signing in —
          most accounts never connect it. If you do, OfferLyst requests read-only access to your
          Gmail (it cannot send, delete, or modify email) and read-only access to your Calendar
          events (it cannot create, edit, or delete events). This access is used only to detect
          messages and events that look related to your job search — interview invitations,
          assessments, offers — and to propose suggestions you review and approve yourself; nothing
          is created or changed automatically.
        </p>
        <p>
          Your Google refresh token is encrypted before it's stored. You can disconnect Google at
          any time from Settings, which stops all further access immediately.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and analytics">
        <p>
          OfferLyst does not use any third-party analytics or advertising trackers, and does not
          set tracking cookies. Your signed-in session is kept in your browser's local storage,
          not a cookie. If you use the mock interview voice feature, your browser's own
          speech-recognition capability may send audio to your browser vendor's transcription
          service (for example, Google's, in Chrome) as part of how that browser feature works —
          this is your browser's behavior, not a service OfferLyst integrates with directly.
        </p>
      </LegalSection>

      <LegalSection title="Data sharing">
        <p>
          We do not sell your data. It is not shared with other users, and it is not used to
          train AI models. It is only sent to the processors named in this policy (Supabase for
          hosting/storage, OpenAI for AI features, Google for the optional Gmail/Calendar
          integration) as needed to provide the product.
        </p>
      </LegalSection>

      <LegalSection title="Data retention and deletion" needsReview>
        <p>
          You can delete individual resumes, saved jobs, and applications from the dashboard at
          any time, and disconnecting Google immediately stops further Gmail/Calendar access.
        </p>
        <p>
          There is currently no self-service "delete my account" feature — full account deletion
          is handled manually by writing to {CONTACT_EMAIL}. This is an honest limitation, not a
          policy choice: a formal data-deletion request process (including any regulatory
          turnaround-time requirements, e.g. under India's DPDP Act or GDPR if applicable to you)
          should be defined with legal input before this product is positioned as fully compliant
          with a specific data-protection regime.
        </p>
      </LegalSection>

      <LegalSection title="Eligibility" needsReview>
        <p>
          OfferLyst is intended for people old enough to enter into a binding agreement in their
          jurisdiction and is not directed at children. The exact minimum age and any
          jurisdiction-specific parental-consent requirements should be confirmed with a lawyer
          before launch.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          If how we handle data changes in a way that affects this policy, we'll update this page
          and change the "Last updated" date above.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about this policy or your data can be sent to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#93C5FD] hover:underline">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
