import type { OscaApplicationOptions } from './types';

export default {
  service: 'social-pension',
  title: 'Social Pension para sa Indigent Senior Citizens',
  heading: 'Sino ang puwedeng mag-apply?',
  verification:
    'Itabi ang pinirmahang intake form, original at photocopy ng Certificate of Indigency, tatlong 1×1 na litrato, at photocopy ng Senior Citizen ID na may tatlong specimen signature o thumbmark ng kanang hinlalaki.',
  confirmation:
    'Kinukumpirma kong pasok ako sa mga kondisyon sa itaas at tama at updated ang impormasyon, litrato, at mga dokumento ko.',
  intro:
    'Para ito sa mga taga-Pateros na edad 60 pataas na mahina na ang katawan, may sakit, o may disability, at walang pension, permanenteng kita, o regular na suporta ng pamilya para sa pangunahing pangangailangan. DSWD-NCR ang mag-a-assess kung qualified ka at maaari silang bumisita sa bahay mo.',
  allowsRepresentative: false,
  endorser: 'DSWD-NCR',
  requirementsHelp:
    'Kunin ang DSWD Social Pension intake form sa OSCA. Humingi sa barangay ng Certificate of Indigency na nakalagay ang eksaktong address mo at Social Pension bilang purpose.',
} satisfies OscaApplicationOptions;
