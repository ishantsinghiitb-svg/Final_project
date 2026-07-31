import { jsPDF } from "jspdf";
import fs from "node:fs";

const doc = new jsPDF({ unit: "pt", format: "letter" });
const lines = [
  "Priya Sharma",
  "Bengaluru, India | priya.sharma.test@example.com | linkedin.com/in/priyasharma-test",
  "",
  "SUMMARY",
  "Product Manager with 4 years of experience shipping consumer growth features at a Series B",
  "fintech startup. Led cross-functional teams of engineers and designers to launch a referral",
  "program that grew monthly signups by 22% and a KYC onboarding redesign that cut drop-off by 35%.",
  "",
  "EXPERIENCE",
  "Product Manager, Kuku Technologies (2022 - Present)",
  "- Owned the referral and rewards product line for a 2M MAU consumer fintech app.",
  "- Shipped a redesigned referral flow that grew monthly signups 22% in one quarter, measured via",
  "  a controlled A/B test against the legacy flow.",
  "- Led the KYC onboarding redesign, partnering with design and 4 engineers; cut onboarding",
  "  drop-off from 41% to 26% by simplifying document capture and adding progress indicators.",
  "- Ran weekly prioritization with engineering leads using a RICE framework to sequence the",
  "  roadmap across growth, trust and safety, and platform reliability workstreams.",
  "- Defined and tracked North Star metrics (activation rate, D7 retention) in Amplitude, presenting",
  "  results to the executive team monthly.",
  "",
  "Associate Product Manager, Kuku Technologies (2021 - 2022)",
  "- Supported the onboarding squad; wrote PRDs and ran usability sessions with 15+ users.",
  "- Built the initial referral program MVP that this role later scaled up.",
  "",
  "Product Intern, Bright Analytics (Summer 2020)",
  "- Analyzed churn drivers across 3 customer segments and presented findings to the VP of Product.",
  "- Prototyped a dashboard mockup in Figma later adopted for the customer-facing analytics product.",
  "",
  "EDUCATION",
  "B.Tech, Computer Science, IIT Bombay (2017 - 2021)",
  "",
  "SKILLS",
  "Product Strategy, A/B Testing, SQL, Amplitude, Figma, Roadmapping, Stakeholder Management,",
  "Cross-functional Leadership, RICE Prioritization, User Research",
  "",
  "PROJECTS",
  "Campus Marketplace App (2020) - Built and launched a peer-to-peer marketplace app for IIT",
  "Bombay students; grew to 800 active users through direct outreach and campus ambassadors.",
];

doc.setFont("helvetica", "normal");
doc.setFontSize(11);
let y = 50;
for (const line of lines) {
  if (line === line.toUpperCase() && line.trim() !== "" && !line.includes(",") && line.length < 20) {
    doc.setFont("helvetica", "bold");
  } else {
    doc.setFont("helvetica", "normal");
  }
  doc.text(line, 50, y);
  y += 16;
  if (y > 720) {
    doc.addPage();
    y = 50;
  }
}

const outPath = process.argv[2] || "./priya-sharma-resume.pdf";
fs.writeFileSync(outPath, Buffer.from(doc.output("arraybuffer")));
console.log("wrote", outPath);
