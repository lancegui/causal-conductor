export interface SpineContract {
  text: string;
  fingerprint: string;
  approvedAt: number;
}

export interface SpineState {
  contract?: SpineContract;
  verified: boolean;
}
