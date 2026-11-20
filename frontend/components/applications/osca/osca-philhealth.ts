import type { OscaApplicationOptions } from './types';

export default {
  service: 'philhealth',
  title: 'Mandatory PhilHealth coverage para sa indigent senior citizens',
  heading: 'Tulong sa PhilHealth enrollment',
  verification: 'Itabi ang pinirmahang PMRF at ang original at photocopy ng mga ID mo para sa verification ng OSCA.',
  confirmation:
    'Isa akong Pilipinong senior citizen na nakatira sa Pateros. Nag-a-apply ako para sa indigent enrollment assistance at kinukumpirma kong tama ang impormasyon at mga dokumento ko.',
  intro:
    'Ire-review ng OSCA ang request mo at ie-endorse sa PhilHealth ang mga qualified na applicant. Kung may PhilHealth number ka na, ilagay ito sa form para makita ng PhilHealth ang record mo.',
  endorser: 'PhilHealth',
  form: {
    url: 'https://www.philhealth.gov.ph/downloads/membership/pmrf_012020.pdf',
    label: 'I-download ang official PhilHealth form (PMRF)',
    error: 'Hindi mabuksan ang PhilHealth form. Puwede kang kumuha ng kopya sa OSCA.',
  },
} satisfies OscaApplicationOptions;
