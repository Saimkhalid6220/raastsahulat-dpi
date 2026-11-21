export const demoTenant = "DEPT_RELIEF_MAIN";
export const demoPassword = "Demo@1234";
export const demoPin = "1234";
export const demoApiKey = "raastsahulat-synthetic-demo-key";
export const demoNames = [
  "Amina Bibi", "Muhammad Saleem", "Mohammad Salim", "Fatima Bibi", "Abdur Rehman",
  "Sakina Beevi", "Ayesha Noor", "Zainab Ali", "Razia Begum", "Nusrat Javed",
] as const;
export const demoScams = [
  ["8171-HELP", "Urgent! Pay a registration fee at http://relief-claim.example.invalid", "SCAM"],
  ["RAAST-HELP", "Confirm your PIN at https://cash.example.invalid", "SCAM"],
  ["8171", "Send your OTP immediately to release the relief payment", "SCAM"],
  ["DEMO-AGENT", "Pay a processing fee to unlock your grant", "SCAM"],
  ["8171", "Enter your password to collect your cash grant", "SCAM"],
  ["RAAST", "Pay a fee today to receive your transfer", "SCAM"],
  ["8171", "Demo case received. Check status in the portal.", "LEGITIMATE"],
  ["RAAST", "Demo transfer status is available in the portal.", "LEGITIMATE"],
  ["8171", "Your demo application is under human review.", "LEGITIMATE"],
  ["RAAST", "A demo transfer has been recorded.", "LEGITIMATE"],
  ["8171", "Your request for consent was received.", "LEGITIMATE"],
  ["8171", "A mock case officer reviewed your demo request.", "LEGITIMATE"],
] as const;
