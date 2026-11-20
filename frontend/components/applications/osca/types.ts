import type { OscaDocumentApplication, OscaDocumentService } from '../../../services/oscaDocumentApi';

export type OscaApplicationOptions = {
  service: OscaDocumentService;
  title: string;
  heading: string;
  intro?: string;
  allowsReplacement?: boolean;
  requestTypes?: OscaDocumentApplication['request_type'][];
  allowsNewAfterRelease?: boolean;
  beneficiaryFor?: OscaDocumentApplication['request_type'];
  verificationByType?: Partial<Record<OscaDocumentApplication['request_type'], string>>;
  allowsRepresentative?: boolean;
  showsSignature?: boolean;
  destinationDocument?: string;
  representativeReminder?: boolean;
  newRequestHelp?: string;
  requirementsHelp?: string;
  verification: string;
  verificationHeading?: string;
  firstRequestVerification?: string;
  wornItem?: string;
  confirmation: string;
  endorser?: string;
  form?: { url: string; label: string; error: string };
};
