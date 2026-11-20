import type { OscaApplicationOptions } from './types';

export default {
  service: 'financial-assistance',
  title: 'Financial Assistance para sa Senior Citizens',
  heading: 'Anong assistance ang kailangan mo?',
  intro: 'Para ito sa medical o burial assistance sa ilalim ng AICS ng Pateros MSWDO. May interview at assessment bago malaman kung qualified ang request.',
  requestTypes: ['medical', 'burial'],
  allowsRepresentative: false,
  beneficiaryFor: 'burial',
  allowsNewAfterRelease: true,
  endorser: 'MSWDO',
  verificationHeading: 'Para sa MSWDO assessment',
  verification: 'Dalhin ang original na mga dokumento. Hintayin ang instructions para sa MSWDO interview at release schedule mula sa Mayor’s Office.',
  verificationByType: {
    medical: 'Dalhin ang original at dalawang photocopy ng valid ID, pati ang Barangay Indigency Clearance, recent prescription o medical abstract, at voter’s ID o certificate at proof of residency para sa interview.',
    burial: 'Dalhin ang registered Death Certificate, original at dalawang photocopy ng Barangay Indigency Clearance, at original at dalawang photocopy ng valid ID ng claimant at yumao.',
  },
  confirmation: 'Kinukumpirma kong tama ang impormasyon at mga dokumento ko para sa assessment ng Pateros MSWDO.',
} satisfies OscaApplicationOptions;
