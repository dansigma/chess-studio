export const MIN_PASSWORD_LENGTH = 10;

export function isValidPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
}

export function passwordLengthError(min: number = MIN_PASSWORD_LENGTH): string {
  return `Password must be at least ${min} characters.`;
}

export function passwordRequirementHint(min: number = MIN_PASSWORD_LENGTH): string {
  return `At least ${min} characters`;
}
