import type { UserProfile } from './authApi';

type CompletionProfile = Partial<Pick<UserProfile,
  'firstName' | 'lastName' | 'email' | 'dob' | 'gender' | 'civilStatus' | 'contact' | 'address' | 'birthcert'
>>;

export function getProfileCompletion(profile: CompletionProfile) {
  return [
    { value: profile.firstName, label: 'first name', hint: 'Add your first name' },
    { value: profile.lastName, label: 'last name', hint: 'Add your last name' },
    { value: profile.email, label: 'email address', hint: 'Add your email' },
    { value: profile.dob, label: 'date of birth', hint: 'Add your date of birth' },
    { value: profile.gender, label: 'gender', hint: 'Choose your gender' },
    { value: profile.civilStatus, label: 'civil status', hint: 'Choose your civil status' },
    { value: profile.contact, label: 'contact number', hint: 'Add a contact number' },
    { value: profile.address, label: 'address', hint: 'Add your address' },
    { value: profile.birthcert, label: 'birth certificate', hint: 'Upload your birth certificate' },
  ].map(({ value, label, hint }) => ({ done: !!value?.trim(), label, hint }));
}
