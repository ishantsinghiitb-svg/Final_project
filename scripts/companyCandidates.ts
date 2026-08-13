// ── Module 10B.1.5: probe INPUT, not registry data ──
//
// Candidate URLs and ATS slugs to TEST. Nothing here is asserted to be
// correct — `probeCompanySources.ts` verifies every one against the live
// source and discards whatever does not answer. Only survivors reach the
// migration.
//
// The one thing asserted is each company's own DOMAIN, which is public,
// stable, and independently checkable. Career PATHS are guessed on purpose and
// left to the probe, because that is exactly the kind of detail that goes
// stale and must never be invented.

export type CompanyCandidate = {
  /** Verbatim from the curated list, including any "A / B" alias form. */
  name: string;
  /** Slugs to try against every ATS public API. */
  atsSlugs?: string[];
  /** Careers URLs to try on the company's own domain. */
  careerUrls?: string[];
  /**
   * Module 11B: the employer's OWN domain (never a job board's), used by the
   * identity gate as the independent signal that a discovered board really
   * belongs to this company. Without it a board can only ever reach
   * "needs review" — name evidence alone cannot separate two companies that
   * share a name, which is how a UAE retailer, a US startup and a US
   * healthcare org each passed a name-only check for an unrelated Indian
   * company. See crawl/verify/boardIdentity.ts.
   */
  domain?: string;
};

const careers = (domain: string, ...paths: string[]): string[] =>
  (paths.length ? paths : ["/careers"]).map((path) => `https://${domain}${path}`);

export const COMPANY_CANDIDATES: CompanyCandidate[] = [
  // ── Indian IT services ──
  { name: "Tata Consultancy Services (TCS)", careerUrls: careers("www.tcs.com", "/careers") },
  { name: "Infosys", careerUrls: careers("www.infosys.com", "/careers") },
  { name: "Wipro", careerUrls: careers("www.wipro.com", "/careers") },
  { name: "HCLTech", careerUrls: careers("www.hcltech.com", "/careers") },
  { name: "Tech Mahindra", careerUrls: careers("careers.techmahindra.com", "/") },
  { name: "LTIMindtree", careerUrls: careers("www.ltimindtree.com", "/careers") },
  { name: "Cognizant India", careerUrls: careers("careers.cognizant.com", "/global/en") },
  { name: "Capgemini India", careerUrls: careers("www.capgemini.com", "/in-en/careers") },
  { name: "Accenture India", careerUrls: careers("www.accenture.com", "/in-en/careers") },
  { name: "IBM India", careerUrls: careers("www.ibm.com", "/in-en/careers") },

  // ── Conglomerates & manufacturing ──
  { name: "Reliance Industries / Jio Platforms", careerUrls: careers("careers.ril.com", "/") },
  { name: "Reliance Retail", careerUrls: careers("careers.relianceretail.com", "/") },
  { name: "Tata Sons / Tata Digital", careerUrls: careers("www.tata.com", "/careers") },
  { name: "Tata Motors", careerUrls: careers("www.tatamotors.com", "/careers") },
  { name: "Tata Elxsi", careerUrls: careers("www.tataelxsi.com", "/careers") },
  { name: "Mahindra & Mahindra", careerUrls: careers("www.mahindra.com", "/careers") },
  { name: "Bajaj Auto / Bajaj Finserv", careerUrls: careers("www.bajajauto.com", "/careers") },
  { name: "Larsen & Toubro (L&T)", careerUrls: careers("www.larsentoubro.com", "/careers") },
  { name: "Adani Group", careerUrls: careers("www.adani.com", "/careers") },
  { name: "Airtel / Bharti Airtel", careerUrls: careers("www.airtel.in", "/careers") },
  { name: "Vodafone Idea", careerUrls: careers("www.myvi.in", "/careers") },
  { name: "ITC", careerUrls: careers("www.itcportal.com", "/careers") },
  { name: "Hindustan Unilever", careerUrls: careers("www.hul.co.in", "/careers") },
  { name: "Asian Paints", careerUrls: careers("www.asianpaints.com", "/careers") },
  { name: "Godrej Group", careerUrls: careers("www.godrej.com", "/careers") },
  { name: "Titan Company", careerUrls: careers("www.titancompany.in", "/careers") },
  { name: "Bosch India", atsSlugs: ["bosch"], careerUrls: careers("www.bosch.in", "/careers") },
  { name: "Siemens India", careerUrls: careers("www.siemens.com", "/in/en/company/jobs.html") },

  // ── Banking & financial services ──
  {
    name: "HDFC Bank / HDFC Life",
    careerUrls: careers("www.hdfcbank.com", "/personal/about-us/careers"),
  },
  { name: "ICICI Bank / ICICI Lombard", careerUrls: careers("www.icicicareers.com", "/") },
  { name: "Axis Bank", careerUrls: careers("www.axisbank.com", "/careers") },
  { name: "Kotak Mahindra Bank", careerUrls: careers("www.kotak.com", "/en/careers.html") },
  { name: "State Bank of India", careerUrls: careers("bank.sbi", "/careers") },
  { name: "Yes Bank", careerUrls: careers("www.yesbank.in", "/careers") },
  {
    name: "IndusInd Bank",
    careerUrls: careers("www.indusind.com", "/in/en/personal/careers.html"),
  },

  // ── Indian IT products & engineering services ──
  { name: "Mphasis", careerUrls: careers("careers.mphasis.com", "/") },
  {
    name: "Persistent Systems",
    atsSlugs: ["persistent"],
    careerUrls: careers("www.persistent.com", "/careers"),
  },
  { name: "Coforge", careerUrls: careers("www.coforge.com", "/careers") },
  { name: "Zensar Technologies", careerUrls: careers("www.zensar.com", "/careers") },
  { name: "Hexaware Technologies", careerUrls: careers("hexaware.com", "/careers") },
  { name: "Cyient", careerUrls: careers("www.cyient.com", "/careers") },
  { name: "L&T Technology Services", careerUrls: careers("www.ltts.com", "/careers") },
  { name: "Tata Communications", careerUrls: careers("www.tatacommunications.com", "/careers") },

  // ── Global tech, India operations ──
  { name: "Samsung R&D India", careerUrls: careers("www.samsung.com", "/in/about-us/careers/") },
  { name: "Google India", careerUrls: careers("www.google.com", "/about/careers/applications/") },
  { name: "Microsoft India", careerUrls: careers("careers.microsoft.com", "/") },
  { name: "Amazon India", careerUrls: careers("www.amazon.jobs", "/en/locations/india") },
  { name: "Adobe India", careerUrls: careers("careers.adobe.com", "/us/en") },
  { name: "SAP Labs India", careerUrls: careers("jobs.sap.com", "/") },
  { name: "Oracle India", careerUrls: careers("www.oracle.com", "/in/careers/") },
  { name: "Cisco India", careerUrls: careers("jobs.cisco.com", "/") },
  { name: "Intuit India", careerUrls: careers("www.intuit.com", "/careers/") },
  { name: "Salesforce India", careerUrls: careers("careers.salesforce.com", "/en/jobs/") },
  { name: "Walmart Global Tech India", careerUrls: careers("careers.walmart.com", "/technology") },

  // ── Global banks, India operations ──
  { name: "Goldman Sachs India", careerUrls: careers("www.goldmansachs.com", "/careers") },
  { name: "JPMorgan Chase India", careerUrls: careers("careers.jpmorgan.com", "/global/en/home") },
  { name: "Morgan Stanley India", careerUrls: careers("www.morganstanley.com", "/careers") },
  { name: "Deutsche Bank India", careerUrls: careers("careers.db.com", "/") },
  {
    name: "American Express India",
    careerUrls: careers("www.americanexpress.com", "/en-us/careers/"),
  },

  // ── Indian consumer internet ──
  { name: "Flipkart", atsSlugs: ["flipkart"], careerUrls: careers("www.flipkartcareers.com", "/") },
  {
    name: "Zomato / Eternal",
    atsSlugs: ["zomato", "eternal"],
    careerUrls: careers("www.zomato.com", "/careers"),
  },
  { name: "Swiggy", atsSlugs: ["swiggy"], careerUrls: careers("careers.swiggy.com", "/") },
  {
    name: "Paytm / One97 Communications",
    atsSlugs: ["paytm"],
    careerUrls: careers("paytm.com", "/careers"),
  },
  { name: "PhonePe", atsSlugs: ["phonepe"], careerUrls: careers("www.phonepe.com", "/careers/") },
  { name: "Razorpay", atsSlugs: ["razorpay"], careerUrls: careers("razorpay.com", "/jobs/") },
  { name: "Zerodha", atsSlugs: ["zerodha"], careerUrls: careers("zerodha.com", "/careers/") },
  { name: "Groww", atsSlugs: ["groww"], careerUrls: careers("groww.in", "/careers") },
  { name: "Meesho", atsSlugs: ["meesho"], careerUrls: careers("www.meesho.io", "/jobs") },
  { name: "Byju's", atsSlugs: ["byjus"], careerUrls: careers("byjus.com", "/careers/") },
  { name: "Unacademy", atsSlugs: ["unacademy"], careerUrls: careers("unacademy.com", "/careers") },
  { name: "upGrad", atsSlugs: ["upgrad"], careerUrls: careers("www.upgrad.com", "/careers/") },
  {
    name: "Ola / Ola Electric",
    atsSlugs: ["ola", "olaelectric"],
    careerUrls: careers("olaelectric.com", "/careers"),
  },
  { name: "Nykaa", atsSlugs: ["nykaa"], careerUrls: careers("www.nykaa.com", "/careers") },
  { name: "Lenskart", atsSlugs: ["lenskart"], careerUrls: careers("www.lenskart.com", "/careers") },
  { name: "CRED", atsSlugs: ["cred", "credavenue"], careerUrls: careers("careers.cred.club", "/") },
  {
    name: "Dream11 / Dream Sports",
    atsSlugs: ["dreamsports", "dream11"],
    careerUrls: careers("www.dreamsports.group", "/careers"),
  },
  {
    name: "PolicyBazaar / PB Fintech",
    atsSlugs: ["policybazaar"],
    careerUrls: careers("www.policybazaar.com", "/careers/"),
  },

  // ── Indian SaaS ──
  {
    name: "Freshworks",
    atsSlugs: ["freshworks"],
    careerUrls: careers("www.freshworks.com", "/company/careers/"),
  },
  // Present in the curated list as a separate line, but Freshdesk is a PRODUCT
  // of Freshworks, not a separate employer. Deliberately given no candidate
  // URLs: `resolveCompanyIdentity` maps it onto Freshworks and the registry
  // loader collapses it into that row rather than probing a second time.
  { name: "Freshdesk / Freshworks" },
  { name: "Zoho", atsSlugs: ["zoho"], careerUrls: careers("www.zoho.com", "/careers/") },
  {
    name: "Postman",
    atsSlugs: ["postman", "postmanlabs"],
    careerUrls: careers("www.postman.com", "/company/careers/"),
  },
  {
    name: "BrowserStack",
    atsSlugs: ["browserstack"],
    careerUrls: careers("www.browserstack.com", "/careers"),
  },
  {
    name: "InMobi",
    atsSlugs: ["inmobi"],
    careerUrls: careers("www.inmobi.com", "/company/careers"),
  },
  {
    name: "ShareChat",
    atsSlugs: ["sharechat", "mohalla"],
    careerUrls: careers("sharechat.com", "/careers"),
  },
  {
    name: "Dailyhunt / VerSe Innovation",
    atsSlugs: ["verse", "dailyhunt"],
    careerUrls: careers("verse.in", "/careers"),
  },
  {
    name: "Chargebee",
    atsSlugs: ["chargebee"],
    careerUrls: careers("www.chargebee.com", "/careers/"),
  },
  {
    name: "Innovaccer",
    atsSlugs: ["innovaccer"],
    careerUrls: careers("innovaccer.com", "/careers"),
  },
  { name: "Darwinbox", atsSlugs: ["darwinbox"], careerUrls: careers("darwinbox.com", "/careers") },
  { name: "Icertis", atsSlugs: ["icertis"], careerUrls: careers("www.icertis.com", "/careers/") },
  {
    name: "HighRadius",
    atsSlugs: ["highradius"],
    careerUrls: careers("www.highradius.com", "/careers/"),
  },
  { name: "Druva", atsSlugs: ["druva"], careerUrls: careers("www.druva.com", "/about/careers") },
  {
    name: "MoEngage",
    atsSlugs: ["moengage"],
    careerUrls: careers("www.moengage.com", "/careers/"),
  },
  { name: "CleverTap", atsSlugs: ["clevertap"], careerUrls: careers("clevertap.com", "/careers/") },
  { name: "Whatfix", atsSlugs: ["whatfix"], careerUrls: careers("whatfix.com", "/careers/") },
  { name: "Hasura", atsSlugs: ["hasura"], careerUrls: careers("hasura.io", "/careers/") },
  {
    name: "Netradyne",
    atsSlugs: ["netradyne"],
    careerUrls: careers("www.netradyne.com", "/careers"),
  },
  { name: "Kissflow", atsSlugs: ["kissflow"], careerUrls: careers("kissflow.com", "/careers/") },
  { name: "Locus.sh", atsSlugs: ["locus", "locussh"], careerUrls: careers("locus.sh", "/careers") },
  {
    name: "Uniphore",
    atsSlugs: ["uniphore"],
    careerUrls: careers("www.uniphore.com", "/careers/"),
  },
  {
    name: "Yellow.ai",
    atsSlugs: ["yellowai", "yellowmessenger"],
    careerUrls: careers("yellow.ai", "/careers/"),
  },
  {
    name: "Observe.AI",
    atsSlugs: ["observeai"],
    careerUrls: careers("www.observe.ai", "/careers"),
  },
  {
    name: "Sprinklr India",
    atsSlugs: ["sprinklr"],
    careerUrls: careers("www.sprinklr.com", "/careers/"),
  },
  { name: "Zeta", atsSlugs: ["zeta"], careerUrls: careers("www.zeta.tech", "/careers") },
  {
    name: "Wingify / VWO",
    atsSlugs: ["wingify", "vwo"],
    careerUrls: careers("wingify.com", "/careers"),
  },
  { name: "Exotel", atsSlugs: ["exotel"], careerUrls: careers("exotel.com", "/careers/") },
  { name: "Fyle", atsSlugs: ["fyle"], careerUrls: careers("www.fylehq.com", "/careers") },
  { name: "Increff", atsSlugs: ["increff"], careerUrls: careers("www.increff.com", "/careers/") },
  {
    name: "Slintel / 6sense",
    atsSlugs: ["6sense", "sixsense"],
    careerUrls: careers("6sense.com", "/careers/"),
  },
  { name: "Signzy", atsSlugs: ["signzy"], careerUrls: careers("www.signzy.com", "/careers/") },
  { name: "Perfios", atsSlugs: ["perfios"], careerUrls: careers("www.perfios.com", "/careers/") },

  // ── Indian logistics, commerce & services ──
  {
    name: "Delhivery",
    atsSlugs: ["delhivery"],
    careerUrls: careers("www.delhivery.com", "/careers"),
  },
  {
    name: "BigBasket",
    atsSlugs: ["bigbasket"],
    careerUrls: careers("www.bigbasket.com", "/careers/"),
  },
  {
    name: "Urban Company",
    atsSlugs: ["urbancompany", "urbanclap"],
    careerUrls: careers("www.urbancompany.com", "/careers"),
  },
  { name: "Cars24", atsSlugs: ["cars24"], careerUrls: careers("www.cars24.com", "/careers/") },
  {
    name: "Cult.fit / Curefit",
    atsSlugs: ["curefit", "cultfit"],
    careerUrls: careers("www.cult.fit", "/careers"),
  },
  {
    name: "Pine Labs",
    atsSlugs: ["pinelabs"],
    careerUrls: careers("www.pinelabs.com", "/careers"),
  },
  {
    name: "Digit Insurance",
    atsSlugs: ["godigit", "digit"],
    careerUrls: careers("www.godigit.com", "/careers"),
  },
  { name: "Acko", atsSlugs: ["acko"], careerUrls: careers("www.acko.com", "/careers/") },
  {
    name: "Zepto",
    atsSlugs: ["zepto", "zeptonow"],
    careerUrls: careers("www.zeptonow.com", "/careers"),
  },
  {
    name: "Blinkit",
    atsSlugs: ["blinkit", "grofers"],
    careerUrls: careers("blinkit.com", "/careers"),
  },
  { name: "Rapido", atsSlugs: ["rapido"], careerUrls: careers("rapido.bike", "/careers") },
  { name: "Udaan", atsSlugs: ["udaan"], careerUrls: careers("udaan.com", "/careers") },
  { name: "Licious", atsSlugs: ["licious"], careerUrls: careers("www.licious.in", "/careers") },
  { name: "Livspace", atsSlugs: ["livspace"], careerUrls: careers("www.livspace.com", "/careers") },
  { name: "BlackBuck", atsSlugs: ["blackbuck"], careerUrls: careers("blackbuck.com", "/careers") },
  { name: "Porter", atsSlugs: ["porter"], careerUrls: careers("porter.in", "/careers") },
  {
    name: "Shiprocket",
    atsSlugs: ["shiprocket"],
    careerUrls: careers("www.shiprocket.in", "/careers/"),
  },
  {
    name: "ClickPost",
    atsSlugs: ["clickpost"],
    careerUrls: careers("www.clickpost.ai", "/careers"),
  },
  {
    name: "Country Delight",
    atsSlugs: ["countrydelight"],
    careerUrls: careers("countrydelight.in", "/careers"),
  },
  {
    name: "Zappfresh",
    atsSlugs: ["zappfresh"],
    careerUrls: careers("www.zappfresh.com", "/careers"),
  },

  // ── Indian D2C ──
  { name: "Wakefit", atsSlugs: ["wakefit"], careerUrls: careers("www.wakefit.co", "/careers") },
  {
    name: "Sleepy Owl",
    atsSlugs: ["sleepyowl"],
    careerUrls: careers("sleepyowl.co", "/pages/careers"),
  },
  {
    name: "Mokobara",
    atsSlugs: ["mokobara"],
    careerUrls: careers("www.mokobara.com", "/pages/careers"),
  },
  {
    name: "boAt / Imagine Marketing",
    atsSlugs: ["boat", "imaginemarketing"],
    careerUrls: careers("www.boat-lifestyle.com", "/pages/careers"),
  },
  {
    name: "Mamaearth / Honasa Consumer",
    atsSlugs: ["honasa", "mamaearth"],
    careerUrls: careers("honasa.in", "/careers"),
  },
  {
    name: "Noise",
    atsSlugs: ["noise", "gonoise"],
    careerUrls: careers("www.gonoise.com", "/pages/careers"),
  },
  {
    name: "Sugar Cosmetics",
    atsSlugs: ["sugarcosmetics"],
    careerUrls: careers("in.sugarcosmetics.com", "/pages/careers"),
  },
  {
    name: "The Man Company",
    atsSlugs: ["themancompany"],
    careerUrls: careers("www.themancompany.com", "/pages/careers"),
  },
  { name: "Purplle", atsSlugs: ["purplle"], careerUrls: careers("www.purplle.com", "/careers") },
  { name: "FirstCry", atsSlugs: ["firstcry"], careerUrls: careers("www.firstcry.com", "/careers") },
  { name: "AJIO / Reliance", careerUrls: careers("www.ajio.com", "/careers") },
  { name: "Snapdeal", atsSlugs: ["snapdeal"], careerUrls: careers("www.snapdeal.com", "/careers") },
  {
    name: "ShopClues",
    atsSlugs: ["shopclues"],
    careerUrls: careers("www.shopclues.com", "/careers"),
  },

  // ── Indian fintech ──
  { name: "Juspay", atsSlugs: ["juspay"], careerUrls: careers("juspay.io", "/careers") },
  { name: "Dhan", atsSlugs: ["dhan"], careerUrls: careers("dhan.co", "/careers/") },
  {
    name: "Slice",
    atsSlugs: ["slice", "sliceit"],
    careerUrls: careers("www.sliceit.com", "/careers"),
  },
  {
    name: "Jupiter / Amica Financial Technologies",
    atsSlugs: ["jupiter", "jupitermoney"],
    careerUrls: careers("jupiter.money", "/careers/"),
  },
  {
    name: "Fi Money / epiFi",
    atsSlugs: ["epifi", "fimoney"],
    careerUrls: careers("fi.money", "/careers"),
  },
  {
    name: "OneCard / FPL Technologies",
    atsSlugs: ["fpltechnologies", "onecard"],
    careerUrls: careers("www.getonecard.app", "/careers"),
  },
  {
    name: "KreditBee",
    atsSlugs: ["kreditbee"],
    careerUrls: careers("www.kreditbee.in", "/careers"),
  },
  { name: "Moneyview", atsSlugs: ["moneyview"], careerUrls: careers("moneyview.in", "/careers") },
  {
    name: "Open Financial Technologies",
    atsSlugs: ["openfinancial", "bankopen"],
    careerUrls: careers("open.money", "/careers"),
  },
  { name: "Khatabook", atsSlugs: ["khatabook"], careerUrls: careers("khatabook.com", "/careers") },
  { name: "Vyapar", atsSlugs: ["vyapar"], careerUrls: careers("vyaparapp.in", "/careers") },
  { name: "BharatPe", atsSlugs: ["bharatpe"], careerUrls: careers("bharatpe.com", "/careers") },
  {
    name: "Simpl",
    atsSlugs: ["simpl", "getsimpl"],
    careerUrls: careers("getsimpl.com", "/careers"),
  },
  { name: "Setu / Pine Labs", atsSlugs: ["setu"], careerUrls: careers("setu.co", "/careers") },
  { name: "Jodo", atsSlugs: ["jodo"], careerUrls: careers("www.jodo.in", "/careers") },

  // ── Indian analytics & AI ──
  {
    name: "Fractal Analytics",
    atsSlugs: ["fractal", "fractalanalytics"],
    careerUrls: careers("fractal.ai", "/careers/"),
  },
  { name: "Mu Sigma", atsSlugs: ["musigma"], careerUrls: careers("www.mu-sigma.com", "/careers") },
  {
    name: "LatentView Analytics",
    atsSlugs: ["latentview"],
    careerUrls: careers("www.latentview.com", "/careers/"),
  },
  { name: "Tredence", atsSlugs: ["tredence"], careerUrls: careers("www.tredence.com", "/careers") },
  { name: "Affine Analytics", atsSlugs: ["affine"], careerUrls: careers("affine.ai", "/careers") },
  {
    name: "Sarvam AI",
    atsSlugs: ["sarvam", "sarvamai"],
    careerUrls: careers("www.sarvam.ai", "/careers"),
  },
  { name: "Neysa", atsSlugs: ["neysa"], careerUrls: careers("neysa.ai", "/careers") },
  { name: "Haptik / Jio", atsSlugs: ["haptik"], careerUrls: careers("www.haptik.ai", "/careers") },

  // ── Indian edtech & deeptech ──
  {
    name: "Physics Wallah",
    atsSlugs: ["physicswallah", "pw"],
    careerUrls: careers("www.pw.live", "/careers"),
  },
  { name: "Vedantu", atsSlugs: ["vedantu"], careerUrls: careers("www.vedantu.com", "/careers") },
  {
    name: "Skyroot Aerospace",
    atsSlugs: ["skyroot"],
    careerUrls: careers("skyroot.in", "/careers"),
  },
  {
    name: "Ather Energy",
    atsSlugs: ["ather", "atherenergy"],
    careerUrls: careers("www.atherenergy.com", "/careers"),
  },

  // ── Indian marketplaces & classifieds ──
  { name: "MyGate", atsSlugs: ["mygate"], careerUrls: careers("mygate.com", "/careers") },
  { name: "NoBroker", atsSlugs: ["nobroker"], careerUrls: careers("www.nobroker.in", "/careers") },
  {
    name: "Housing.com / REA India",
    atsSlugs: ["reaindia", "housing"],
    careerUrls: careers("housing.com", "/careers"),
  },
  { name: "99acres / Info Edge", careerUrls: careers("www.infoedge.in", "/careers.aspx") },
  { name: "Naukri.com / Info Edge", careerUrls: careers("www.naukri.com", "/careers") },
  { name: "Jeevansathi / Info Edge", careerUrls: careers("www.jeevansathi.com", "/careers") },
  {
    name: "Shaadi.com",
    atsSlugs: ["shaadi", "shaadicom"],
    careerUrls: careers("www.shaadi.com", "/careers"),
  },
  {
    name: "Knowlarity",
    atsSlugs: ["knowlarity"],
    careerUrls: careers("www.knowlarity.com", "/careers/"),
  },
];
