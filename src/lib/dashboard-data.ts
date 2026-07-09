export type PipelineStage = "interested" | "applied" | "interview" | "offer" | "rejected";

export type Job = {
  id: string;
  company: string;
  role: string;
  location: string;
  salary: string;
  posted: string;
  source: "LinkedIn" | "Wellfound" | "Greenhouse" | "Lever" | "Ashby" | "Careers";
  match: number;
  logoTone: string;
  saved?: boolean;
  stage?: PipelineStage;
  appliedAt?: string;
  nextStep?: string;
  tags?: string[];
  remote?: boolean;
};

export const jobs: Job[] = [
  { id: "j1", company: "Linear", role: "Senior Product Designer", location: "Remote · US", salary: "$180–$220k", posted: "2d ago", source: "Greenhouse", match: 94, logoTone: "from-[#5E6AD2] to-[#3B82F6]", saved: true, stage: "interview", appliedAt: "6 days ago", nextStep: "Onsite loop — Tue", tags: ["Design systems", "Product"], remote: true },
  { id: "j2", company: "Vercel", role: "Frontend Engineer", location: "Remote · Global", salary: "$170–$210k", posted: "5h ago", source: "Ashby", match: 91, logoTone: "from-[#111827] to-[#374151]", saved: true, stage: "applied", appliedAt: "2 days ago", nextStep: "Awaiting recruiter", tags: ["React", "Next.js"], remote: true },
  { id: "j3", company: "Stripe", role: "Design Engineer, Payments", location: "SF · Hybrid", salary: "$200–$250k", posted: "1d ago", source: "Greenhouse", match: 88, logoTone: "from-[#635BFF] to-[#7C3AED]", saved: true, stage: "offer", appliedAt: "3 weeks ago", nextStep: "Offer — respond by Fri", tags: ["Design", "TypeScript"] },
  { id: "j4", company: "Notion", role: "Product Engineer", location: "NYC · Hybrid", salary: "$190–$230k", posted: "3d ago", source: "LinkedIn", match: 86, logoTone: "from-[#E5E7EB] to-[#9CA3AF]", saved: true, stage: "interested", tags: ["Full-stack"] },
  { id: "j5", company: "Raycast", role: "Senior Design Engineer", location: "Remote · EU", salary: "€120–€160k", posted: "1w ago", source: "Careers", match: 90, logoTone: "from-[#FF6363] to-[#F59E0B]", saved: true, stage: "applied", appliedAt: "8 days ago", nextStep: "Recruiter call — Thu", tags: ["Motion", "React"], remote: true },
  { id: "j6", company: "Anthropic", role: "Product Designer", location: "SF · Hybrid", salary: "$210–$260k", posted: "12h ago", source: "Greenhouse", match: 82, logoTone: "from-[#C97A5A] to-[#7C3AED]", stage: "interested", tags: ["AI"] },
  { id: "j7", company: "Figma", role: "Senior Frontend Engineer", location: "Remote · US", salary: "$200–$240k", posted: "4d ago", source: "Lever", match: 89, logoTone: "from-[#F24E1E] to-[#A259FF]", saved: true, stage: "offer", appliedAt: "1 month ago", nextStep: "Offer accepted 🎉", tags: ["React", "Canvas"] },
  { id: "j8", company: "Wellfound", role: "Full-Stack Engineer", location: "Remote · Global", salary: "$140–$180k", posted: "2d ago", source: "Wellfound", match: 78, logoTone: "from-[#000] to-[#374151]", tags: ["Startup"] },
  { id: "j9", company: "Ramp", role: "Product Designer", location: "NYC · Hybrid", salary: "$180–$220k", posted: "6d ago", source: "Ashby", match: 84, logoTone: "from-[#F59E0B] to-[#EAB308]", stage: "rejected", appliedAt: "3 weeks ago", nextStep: "Not moving forward", tags: ["Fintech"] },
  { id: "j10", company: "Arc", role: "Product Engineer", location: "Remote", salary: "$170–$210k", posted: "9d ago", source: "Careers", match: 87, logoTone: "from-[#EC4899] to-[#8B5CF6]", saved: true, stage: "interested", tags: ["Browser"] },
  { id: "j11", company: "Perplexity", role: "Senior Frontend Engineer", location: "SF · Onsite", salary: "$220–$280k", posted: "1d ago", source: "Greenhouse", match: 85, logoTone: "from-[#20B8CD] to-[#0EA5E9]", tags: ["AI", "Search"] },
  { id: "j12", company: "Retool", role: "Design Engineer", location: "SF · Hybrid", salary: "$190–$230k", posted: "3d ago", source: "Lever", match: 83, logoTone: "from-[#3B82F6] to-[#6366F1]", stage: "applied", appliedAt: "1 week ago", nextStep: "Take-home due Mon" },
];

export type Interview = {
  id: string;
  company: string;
  role: string;
  when: string;
  time: string;
  interviewer: string;
  type: "Recruiter" | "Technical" | "Design" | "Behavioral" | "Onsite" | "Offer chat";
  link?: string;
  prep?: string;
};

export const interviews: Interview[] = [
  { id: "i1", company: "Linear", role: "Sr. Product Designer", when: "Today", time: "2:30 PM", interviewer: "Karri Saarinen", type: "Design", link: "meet.google.com/abc", prep: "Portfolio walkthrough" },
  { id: "i2", company: "Vercel", role: "Frontend Engineer", when: "Tomorrow", time: "10:00 AM", interviewer: "Guillermo Rauch", type: "Recruiter", link: "zoom.us/j/123", prep: "Compensation expectations" },
  { id: "i3", company: "Raycast", role: "Sr. Design Engineer", when: "Thu, Jul 16", time: "3:00 PM", interviewer: "Thomas Paul Mann", type: "Technical", link: "meet.google.com/xyz", prep: "System design — command palette" },
  { id: "i4", company: "Stripe", role: "Design Engineer", when: "Fri, Jul 17", time: "1:00 PM", interviewer: "Katie Dill", type: "Onsite", prep: "5 back-to-back sessions" },
  { id: "i5", company: "Retool", role: "Design Engineer", when: "Mon, Jul 20", time: "11:00 AM", interviewer: "David Hsu", type: "Behavioral", link: "meet.google.com/def", prep: "Leadership stories" },
];

export type Resume = {
  id: string;
  name: string;
  tailoredFor?: string;
  updated: string;
  score: number;
  keywords: number;
  used: number;
};

export const resumes: Resume[] = [
  { id: "r1", name: "Ava — Product Design (Master)", updated: "Updated today", score: 92, keywords: 34, used: 12 },
  { id: "r2", name: "Ava — Linear tailored", tailoredFor: "Linear · Sr. Product Designer", updated: "2 days ago", score: 94, keywords: 41, used: 1 },
  { id: "r3", name: "Ava — Design Engineer", tailoredFor: "Vercel · Frontend Engineer", updated: "5 days ago", score: 88, keywords: 29, used: 3 },
  { id: "r4", name: "Ava — Startup generalist", updated: "2 weeks ago", score: 81, keywords: 22, used: 6 },
];

export type Note = {
  id: string;
  title: string;
  body: string;
  company?: string;
  updated: string;
  tag: "Prep" | "Question" | "Followup" | "Idea";
};

export const notes: Note[] = [
  { id: "n1", title: "Questions for Linear onsite", body: "How does the design team collaborate with eng on new primitives? What does the roadmap for cycles look like?", company: "Linear", updated: "1 hr ago", tag: "Question" },
  { id: "n2", title: "Follow up with Guillermo", body: "Thank you note after recruiter chat. Mention the deploy DX conversation.", company: "Vercel", updated: "Yesterday", tag: "Followup" },
  { id: "n3", title: "STAR — Design system rollout", body: "Situation: 40 designers, no tokens. Task: unify. Action: shipped v1 in 6w. Result: 3x velocity.", updated: "3 days ago", tag: "Prep" },
  { id: "n4", title: "Portfolio narrative", body: "Lead with the outcome. Show the mess before the polish. End with what I'd change.", updated: "1 week ago", tag: "Idea" },
];

export type Activity = {
  id: string;
  kind: "match" | "interview" | "offer" | "saved" | "resume" | "reject";
  text: string;
  when: string;
};

export const activity: Activity[] = [
  { id: "a1", kind: "interview", text: "Interview scheduled — Linear, today at 2:30 PM", when: "12 min ago" },
  { id: "a2", kind: "match", text: "Your resume matches Perplexity at 85%", when: "1 hr ago" },
  { id: "a3", kind: "offer", text: "Offer received — Figma · Senior Frontend Engineer", when: "Yesterday" },
  { id: "a4", kind: "saved", text: "Saved 3 roles from Wellfound", when: "Yesterday" },
  { id: "a5", kind: "resume", text: "Tailored resume for Vercel · Frontend Engineer", when: "2 days ago" },
  { id: "a6", kind: "reject", text: "Ramp — thanks but no thanks", when: "3 days ago" },
];

export const stageMeta: Record<PipelineStage, { label: string; tone: string; dot: string }> = {
  interested: { label: "Interested", tone: "text-[oklch(0.45_0.02_265)] bg-black/[0.04]", dot: "bg-[oklch(0.6_0.02_265)]" },
  applied: { label: "Applied", tone: "text-[#2563EB] bg-[#2563EB]/10", dot: "bg-[#2563EB]" },
  interview: { label: "Interview", tone: "text-[#7C3AED] bg-[#7C3AED]/10", dot: "bg-[#7C3AED]" },
  offer: { label: "Offer", tone: "text-[#16A34A] bg-[#22C55E]/15", dot: "bg-[#16A34A]" },
  rejected: { label: "Closed", tone: "text-[oklch(0.5_0.02_265)] bg-black/[0.04]", dot: "bg-[oklch(0.6_0.02_265)]" },
};

export const stats = {
  activeApps: 24,
  interviews: 5,
  matchAvg: 87,
  offers: 2,
  weeklyGoal: 8,
  weeklyDone: 6,
};

export const notifications = [
  { id: "notif1", title: "Interview in 45 minutes", body: "Linear · Design round with Karri Saarinen", when: "Just now", unread: true },
  { id: "notif2", title: "Stripe extended an offer", body: "Respond by Friday. Base $220k + equity.", when: "2 hr ago", unread: true },
  { id: "notif3", title: "Follow up with Vercel", body: "It's been 5 days since the recruiter call.", when: "Yesterday", unread: false },
  { id: "notif4", title: "New matches on LinkedIn", body: "3 roles above 85% match were posted today.", when: "Yesterday", unread: false },
];
export type ActionItem = {
  id: string;
  kind: "interview" | "followup" | "resume" | "deadline" | "match" | "apply";
  title: string;
  detail: string;
  cta: string;
  to: string;
  priority: "high" | "medium" | "low";
};

export const actionItems: ActionItem[] = [
  { id: "act1", kind: "interview", title: "Linear design round — today at 2:30 PM", detail: "With Karri Saarinen. Open AI prep for likely questions and company research.", cta: "Prepare interview", to: "/dashboard/interviews", priority: "high" },
  { id: "act2", kind: "followup", title: "Follow up with Vercel", detail: "It's been 5 days since the recruiter call. A short nudge usually helps.", cta: "Send follow-up", to: "/dashboard/applications", priority: "high" },
  { id: "act3", kind: "resume", title: "Your Linear resume scores 76 on keywords", detail: "Add 'motion' and 'interaction' — they're 4 of the 10 JD keywords.", cta: "Improve resume", to: "/dashboard/resumes", priority: "medium" },
  { id: "act4", kind: "deadline", title: "Retool take-home due Monday", detail: "You have 2 days left. The prompt is in your interview notes.", cta: "Open take-home", to: "/dashboard/interviews", priority: "medium" },
  { id: "act5", kind: "match", title: "3 new roles above 85% match", detail: "Perplexity, Arc, and Ramp were posted today and fit your resume well.", cta: "Review matches", to: "/dashboard/jobs", priority: "low" },
];

export type OnboardingStep = {
  id: string;
  label: string;
  detail: string;
  to: string;
};

export const onboardingSteps: OnboardingStep[] = [
  { id: "ob1", label: "Upload your resume", detail: "So NextOffer can score it against jobs you save.", to: "/dashboard/resumes" },
  { id: "ob2", label: "Install the Chrome extension", detail: "Save any job from LinkedIn, Wellfound, or Greenhouse in one click.", to: "/features" },
  { id: "ob3", label: "Save your first job", detail: "Browse a job board and hit the NextOffer button.", to: "/dashboard/jobs" },
  { id: "ob4", label: "Generate a resume match", detail: "See how well your resume fits a role — and what to change.", to: "/dashboard/resumes" },
  { id: "ob5", label: "Apply to your first role", detail: "Move a job from Interested to Applied to start your pipeline.", to: "/dashboard/applications" },
  { id: "ob6", label: "Track your progress", detail: "Watch your pipeline fill up as you apply and hear back.", to: "/dashboard/analytics" },
];
