import type { OscaApplicationOptions } from './types';

export default {
  service: 'osca-transfer',
  title: 'Certificate of Transfer at OSCA-Pateros Membership Cancellation',
  heading: 'Bagong address',
  verification:
    'Kumuha ng Barangay Certificate sa barangay kung saan ka nakatira ngayon. Dalhin ang original na Senior Citizen ID para maisauli sa OSCA-Pateros at ma-process ang cancellation at certificate.',
  confirmation:
    'Lumipat na ako sa address na ito at nire-request kong i-cancel ang OSCA-Pateros membership ko. Tama ang impormasyon at mga dokumento ko.',
  intro:
    'Para ito sa OSCA-Pateros members na lumipat na ng tirahan at kailangang ilipat ang membership sa bagong lungsod o munisipalidad.',
  destinationDocument: 'transfer_residency',
  representativeReminder: true,
} satisfies OscaApplicationOptions;
