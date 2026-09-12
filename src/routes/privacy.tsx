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

const LAST_UPDATED = "September 12, 2026";

function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      lastUpdated={LAST_UPDATED}
      intro={
        <>
          This policy describes what data OfferLyst collects, why, and how it's used. It is written
          to match what the product actually does, not a generic template — if something here stops
          being true as the product changes, this page is expected to change with it.
        </>
      }
    >
      <LegalSection title="Account data">
        <p>
          Creating an account requires an email address and password. We store your name, email, and
          any location or target-role information you add in Settings. This data is scoped to your
          account: our database enforces that only you can read or write it, and it's never shared
          with other users.
        </p>
      </LegalSection>

      <LegalSection title="Resumes and documents">
        <p>
          Resume files you upload are stored in our file storage and automatically parsed right
          after upload to extract their text content. This parsing happens on our servers and does
          not involve a third-party AI service — it is a separate step from the AI features
          described below, which only run when you actively trigger one.
        </p>
        <p>
          If you upload an avatar image, note that avatar images are stored in a location that is
          publicly readable by anyone who has the exact file URL (the URL itself is not discoverable
          or listed anywhere) — unlike your resumes, applications and account data, which are
          private to your account.
        </p>
      </LegalSection>

      <LegalSection title="AI features and third-party processing">
        <p>
          AI features (resume match, ATS compatibility check, resume optimization, cover letter
          drafting, interview preparation, and mock interviews) are powered by OpenAI. When you
          trigger one of these actions, the relevant data — your resume text, the job posting's
          details (role, company, description, requirements), and your target role/location if set —
          is sent to OpenAI to generate the result. This only happens when you actively use an AI
          feature; browsing, saving jobs, and tracking applications never sends anything to OpenAI.
        </p>
        <p>
          Reviewing your Gmail inbox (see below) uses a narrower, separate process: only structured
          facts about an email — the sender's domain and name, the subject line, and Gmail's own
          short preview snippet — are sent for classification, never the full email body or other
          emails.
        </p>
        <p>
          We do not control how OpenAI itself retains or uses submitted data beyond what it sends
          back to us; refer to OpenAI's own privacy and data-usage terms for details on their side.
        </p>
      </LegalSection>

      <LegalSection title="Browser extension">
        <p>
          The OfferLyst Chrome extension reads job posting content (title, company, description, and
          similar public details) on supported job sites ({SUPPORTED_PLATFORM_NAMES.join(", ")}) to
          let you save or track a role in one click. It does not read anything on pages other than
          the job posting content itself, and it does not request access to your browsing history or
          cookies on other sites.
        </p>
        <p>
          To know you're signed in, the extension reads your OfferLyst session token from this
          site's own local browser storage — the same mechanism the website itself uses to keep you
          signed in — only when you're on the OfferLyst site. It does not have a separate login and
          never sees your password.
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
          Your Google refresh token is encrypted before it's stored. You can disconnect Gmail or
          Calendar independently at any time from Settings — disconnecting one stops that
          product's access immediately and has no effect on the other. Disconnecting Gmail also
          deletes the Gmail message data OfferLyst has synced and stored for your account; it
          does not delete Calendar data if Calendar remains connected.
        </p>
      </LegalSection>

      <LegalSection title="Data Security and Protection">
        <p>
          OfferLyst uses reasonable technical and organizational safeguards designed to protect
          personal information and Google user data against unauthorized access, alteration,
          disclosure, or destruction. Data transmitted between your device, OfferLyst, and our
          service providers is protected using HTTPS/TLS encryption in transit. Access to Google
          user data is restricted to the functionality for which you have granted permission. OAuth
          credentials and access tokens are handled using security controls designed to prevent
          unauthorized access. OfferLyst does not sell Google user data. Google user data is handled
          in accordance with the Google API Services User Data Policy and applicable Limited Use
          requirements. We maintain access controls and other reasonable security measures
          appropriate to the nature of the information we process.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and analytics">
        <p>
          OfferLyst does not use any third-party analytics or advertising trackers, and does not set
          tracking cookies. Your signed-in session is kept in your browser's local storage, not a
          cookie. If you use the mock interview voice feature, your browser's own speech-recognition
          capability may send audio to your browser vendor's transcription service (for example,
          Google's, in Chrome) as part of how that browser feature works — this is your browser's
          behavior, not a service OfferLyst integrates with directly.
        </p>
      </LegalSection>

      <LegalSection title="Data sharing">
        <p>
          We do not sell your data. It is not shared with other users, and it is not used to train
          AI models. It is only sent to the processors named in this policy (Supabase for
          hosting/storage, OpenAI for AI features, Google for the optional Gmail/Calendar
          integration) as needed to provide the product.
        </p>
      </LegalSection>

      <LegalSection title="Data retention and deletion">
        <p>
          You can delete individual resumes, saved jobs, and applications from the dashboard at any
          time. See "Google Gmail and Calendar integration" above for what disconnecting Gmail or
          Calendar removes.
        </p>
        <p>
          You can also permanently delete your entire OfferLyst account from Settings. This removes
          your account and every piece of associated data from our database — including your
          profile, applications, resumes, saved jobs, collections, interviews, AI usage history,
          Google connection/token data, and any synced Gmail messages and Calendar events — and
          deletes your uploaded files (resumes, avatars, and other documents) from storage. This only
          removes data OfferLyst itself stored; it does not delete anything on Google's own side.
          Account deletion is permanent and cannot be undone. If you're unable to sign in and need
          your account deleted, contact {CONTACT_EMAIL}.
        </p>
        <p>
          Having a deletion mechanism does not by itself mean OfferLyst is certified compliant with
          any specific data-protection law, such as India's DPDP Act or the EU's GDPR — we do not
          make that claim.
        </p>
      </LegalSection>

      <LegalSection title="Eligibility">
        <p>
          You must be at least 18 years old to create an OfferLyst account or use the service.
          OfferLyst is not directed at, and does not knowingly collect information from, anyone
          under 18.
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
