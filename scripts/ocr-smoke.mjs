// Temporary file used to smoke-test the OpenCodeReview workflow.
export function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function firstWord(text) {
  return text.split(" ").shift().toUpperCase();
}
