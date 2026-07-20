import type { ReactNode } from "react";
import { format, parseISO } from "date-fns";
import {
  ListChecks,
  ClipboardCheck,
  Sparkles,
  Gift,
  Cpu,
  Languages as LanguagesIcon,
  UserRound,
  Building2,
  Factory,
  Banknote,
  CalendarClock,
  ExternalLink,
} from "lucide-react";
import { DashCard, SectionTitle } from "@/components/dashboard/primitives";
import type { GlobalJob } from "@/types";

/**
 * JobMetadataSections
 *
 * Read-only presentation of the richer Universal Job Model metadata already
 * stored on `global_jobs` (responsibilities, requirements, preferred
 * qualifications, benefits, technologies, languages, recruiter, company size,
 * industry, salary text, expiry date) that the Job Detail page did not
 * previously surface. Purely additive: displays existing columns only — no new
 * data is written or requested. Every section renders ONLY when its underlying
 * field holds data, so a sparse job (e.g. a manual import) shows nothing extra
 * and the page looks identical to before.
 */

function hasItems(value: string[] | null | undefined): value is string[] {
  return Array.isArray(value) && value.some((v) => v && v.trim() !== "");
}

function cleanItems(value: string[]): string[] {
  return value.map((v) => v.trim()).filter((v) => v !== "");
}

// ── Bulleted list card (responsibilities / requirements / preferred quals / benefits) ──
function ListSection({
  icon,
  title,
  items,
}: {
  icon: ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <DashCard>
      <SectionTitle>
        <span className="inline-flex items-center gap-2">
          {icon}
          {title}
        </span>
      </SectionTitle>
      <ul className="mt-4 space-y-2">
        {cleanItems(items).map((item, i) => (
          <li
            key={i}
            className="flex gap-2.5 text-sm leading-relaxed text-[oklch(0.3_0.02_265)]"
          >
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563EB]/60" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </DashCard>
  );
}

// ── Chip card (technologies / languages) ──
function ChipSection({
  icon,
  title,
  items,
}: {
  icon: ReactNode;
  title: string;
  items: string[];
}) {
  return (
    <DashCard>
      <SectionTitle>
        <span className="inline-flex items-center gap-2">
          {icon}
          {title}
        </span>
      </SectionTitle>
      <div className="mt-4 flex flex-wrap gap-2">
        {cleanItems(items).map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center rounded-full border border-black/5 bg-[oklch(0.97_0.01_265)] px-3 py-1.5 text-xs font-medium text-[oklch(0.35_0.02_265)]"
          >
            {item}
          </span>
        ))}
      </div>
    </DashCard>
  );
}

// ── Key/value row for the "At a glance" details card ──
function DetailRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 shrink-0 text-[oklch(0.5_0.02_265)]">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-[oklch(0.55_0.02_265)]">
          {label}
        </p>
        <div className="mt-0.5 text-sm font-medium text-[oklch(0.25_0.02_265)]">
          {children}
        </div>
      </div>
    </div>
  );
}

export function JobMetadataSections({ job }: { job: GlobalJob }) {
  // Expiry date — render only when it parses to a real date.
  let expiryLabel: string | null = null;
  if (job.expiry_date) {
    try {
      expiryLabel = format(parseISO(job.expiry_date), "d MMM yyyy");
    } catch {
      expiryLabel = null;
    }
  }

  const hasRecruiter = Boolean(job.recruiter_name?.trim());
  const hasCompanySize = Boolean(job.company_size?.trim());
  const hasIndustry = Boolean(job.industry?.trim());
  const hasSalaryText = Boolean(job.salary_text?.trim());
  const hasExpiry = Boolean(expiryLabel);

  const hasDetailCard =
    hasRecruiter || hasCompanySize || hasIndustry || hasSalaryText || hasExpiry;

  return (
    <>
      {hasItems(job.responsibilities) && (
        <ListSection
          icon={<ListChecks className="h-4 w-4 text-[#2563EB]" />}
          title="Responsibilities"
          items={job.responsibilities}
        />
      )}

      {hasItems(job.requirements) && (
        <ListSection
          icon={<ClipboardCheck className="h-4 w-4 text-[#7C3AED]" />}
          title="Requirements"
          items={job.requirements}
        />
      )}

      {hasItems(job.preferred_qualifications) && (
        <ListSection
          icon={<Sparkles className="h-4 w-4 text-[#F59E0B]" />}
          title="Preferred Qualifications"
          items={job.preferred_qualifications}
        />
      )}

      {hasItems(job.benefits) && (
        <ListSection
          icon={<Gift className="h-4 w-4 text-[#16A34A]" />}
          title="Benefits & Perks"
          items={job.benefits}
        />
      )}

      {hasItems(job.technologies) && (
        <ChipSection
          icon={<Cpu className="h-4 w-4 text-[#0EA5E9]" />}
          title="Technologies"
          items={job.technologies}
        />
      )}

      {hasItems(job.languages) && (
        <ChipSection
          icon={<LanguagesIcon className="h-4 w-4 text-[#EC4899]" />}
          title="Languages"
          items={job.languages}
        />
      )}

      {hasDetailCard && (
        <DashCard>
          <SectionTitle>At a glance</SectionTitle>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {hasRecruiter && (
              <DetailRow icon={<UserRound className="h-4 w-4" />} label="Recruiter">
                {job.recruiter_profile ? (
                  <a
                    href={job.recruiter_profile}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[#2563EB] hover:underline"
                  >
                    {job.recruiter_name}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  job.recruiter_name
                )}
              </DetailRow>
            )}

            {hasCompanySize && (
              <DetailRow icon={<Building2 className="h-4 w-4" />} label="Company size">
                {job.company_size}
              </DetailRow>
            )}

            {hasIndustry && (
              <DetailRow icon={<Factory className="h-4 w-4" />} label="Industry">
                {job.industry}
              </DetailRow>
            )}

            {hasSalaryText && (
              <DetailRow icon={<Banknote className="h-4 w-4" />} label="Compensation">
                {job.salary_text}
              </DetailRow>
            )}

            {hasExpiry && (
              <DetailRow icon={<CalendarClock className="h-4 w-4" />} label="Apply by">
                {expiryLabel}
              </DetailRow>
            )}
          </div>
        </DashCard>
      )}
    </>
  );
}
